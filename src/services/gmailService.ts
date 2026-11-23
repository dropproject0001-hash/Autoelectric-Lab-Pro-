import {
  BenchDocTelemetryPayload,
  buildBenchReportText,
  GoogleWorkspaceAuthError,
  parseGoogleWorkspaceHttpError,
} from './googleDocsService';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailLabel {
  id: string;
  name: string;
  type?: string;
  messagesTotal?: number;
  messagesUnread?: number;
}

export interface GmailAttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  labelIds: string[];
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  isUnread: boolean;
  internalDate?: string;
}

export interface GmailMessageDetail extends GmailMessageSummary {
  bodyText: string;
  attachments: GmailAttachmentMeta[];
}

export interface GmailDraftSummary {
  draftId: string;
  message: GmailMessageSummary;
}

interface RawGmailHeader {
  name?: string;
  value?: string;
}

interface RawGmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: RawGmailHeader[];
  body?: {
    attachmentId?: string;
    size?: number;
    data?: string;
  };
  parts?: RawGmailPart[];
}

interface RawGmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: RawGmailPart;
}

async function gmailFetch<T>(
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
      'Gmail',
      'Gmail permissions are missing or denied. Click Sign in with Google to grant Gmail access.'
    );
  }

  return json as T;
}

function decodeBase64UrlUtf8(data?: string): string {
  if (!data) return '';
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLength);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function encodeBase64UrlUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeRfc2047Subject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) {
    return subject.replace(/[\r\n]+/g, ' ');
  }
  const b64 = btoa(
    Array.from(new TextEncoder().encode(subject))
      .map((b) => String.fromCharCode(b))
      .join('')
  );
  return `=?UTF-8?B?${b64}?=`;
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function getHeader(headers: RawGmailHeader[] | undefined, target: string): string {
  if (!headers) return '';
  const lower = target.toLowerCase();
  return headers.find((h) => h.name?.toLowerCase() === lower)?.value || '';
}

function decodeHtmlEntitiesToText(html: string): string {
  const withoutScripts = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return withoutScripts
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractBodyAndAttachments(part: RawGmailPart | undefined): {
  plainParts: string[];
  htmlParts: string[];
  attachments: GmailAttachmentMeta[];
} {
  const plainParts: string[] = [];
  const htmlParts: string[] = [];
  const attachments: GmailAttachmentMeta[] = [];

  const walk = (node: RawGmailPart | undefined) => {
    if (!node) return;
    if (node.filename && node.body?.attachmentId) {
      attachments.push({
        filename: node.filename,
        mimeType: node.mimeType || 'application/octet-stream',
        size: node.body.size || 0,
        attachmentId: node.body.attachmentId,
      });
    }
    if (node.mimeType === 'text/plain' && node.body?.data) {
      const decoded = decodeBase64UrlUtf8(node.body.data);
      if (decoded.trim()) plainParts.push(decoded);
    } else if (node.mimeType === 'text/html' && node.body?.data) {
      const decoded = decodeBase64UrlUtf8(node.body.data);
      if (decoded.trim()) htmlParts.push(decoded);
    }
    if (Array.isArray(node.parts)) {
      node.parts.forEach(walk);
    }
  };

  walk(part);
  return { plainParts, htmlParts, attachments };
}

function parseGmailSummary(raw: RawGmailMessage): GmailMessageSummary {
  const headers = raw.payload?.headers;
  const labelIds = raw.labelIds || [];
  return {
    id: raw.id,
    threadId: raw.threadId || raw.id,
    snippet: raw.snippet || '',
    labelIds,
    subject: getHeader(headers, 'Subject') || '(No Subject)',
    from: getHeader(headers, 'From') || 'Unknown Sender',
    to: getHeader(headers, 'To') || '',
    cc: getHeader(headers, 'Cc') || '',
    date: getHeader(headers, 'Date') || '',
    isUnread: labelIds.includes('UNREAD'),
    internalDate: raw.internalDate,
  };
}

function buildRawMimeEmail(input: {
  to: string;
  cc?: string;
  subject: string;
  bodyText: string;
}): string {
  const headers = [
    `To: ${sanitizeHeaderValue(input.to)}`,
    ...(input.cc?.trim() ? [`Cc: ${sanitizeHeaderValue(input.cc)}`] : []),
    `Subject: ${encodeRfc2047Subject(input.subject.trim() || '(No Subject)')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];
  const rfc2822 = `${headers.join('\r\n')}\r\n\r\n${input.bodyText}`;
  return encodeBase64UrlUtf8(rfc2822);
}

export async function listGmailLabels(accessToken: string): Promise<GmailLabel[]> {
  const data = await gmailFetch<{ labels?: GmailLabel[] }>(
    `${GMAIL_API_BASE}/labels`,
    accessToken
  );
  return data.labels || [];
}

export async function listGmailMessages(
  accessToken: string,
  options: {
    q?: string;
    labelIds?: string[];
    maxResults?: number;
    pageToken?: string;
  } = {}
): Promise<{ messages: GmailMessageSummary[]; nextPageToken?: string; resultSizeEstimate?: number }> {
  const params = new URLSearchParams({
    maxResults: String(options.maxResults ?? 15),
  });
  if (options.q?.trim()) {
    params.set('q', options.q.trim());
  }
  if (options.pageToken) {
    params.set('pageToken', options.pageToken);
  }
  (options.labelIds || []).forEach((label) => {
    params.append('labelIds', label);
  });

  const listRes = await gmailFetch<{
    messages?: { id: string; threadId: string }[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }>(`${GMAIL_API_BASE}/messages?${params.toString()}`, accessToken);

  const refs = listRes.messages || [];
  if (refs.length === 0) {
    return {
      messages: [],
      nextPageToken: listRes.nextPageToken,
      resultSizeEstimate: listRes.resultSizeEstimate,
    };
  }

  const metaParams = new URLSearchParams({ format: 'metadata' });
  ['Subject', 'From', 'To', 'Cc', 'Date'].forEach((hdr) =>
    metaParams.append('metadataHeaders', hdr)
  );

  const detailed = await Promise.all(
    refs.map((ref) =>
      gmailFetch<RawGmailMessage>(
        `${GMAIL_API_BASE}/messages/${encodeURIComponent(ref.id)}?${metaParams.toString()}`,
        accessToken
      )
    )
  );

  return {
    messages: detailed.map(parseGmailSummary),
    nextPageToken: listRes.nextPageToken,
    resultSizeEstimate: listRes.resultSizeEstimate,
  };
}

export async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessageDetail> {
  const raw = await gmailFetch<RawGmailMessage>(
    `${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}?format=full`,
    accessToken
  );
  const summary = parseGmailSummary(raw);
  const { plainParts, htmlParts, attachments } = extractBodyAndAttachments(raw.payload);

  let bodyText = plainParts.join('\n\n').trim();
  if (!bodyText && htmlParts.length > 0) {
    bodyText = decodeHtmlEntitiesToText(htmlParts.join('\n\n'));
  }
  if (!bodyText && raw.payload?.body?.data) {
    bodyText = decodeBase64UrlUtf8(raw.payload.body.data).trim();
  }
  if (!bodyText) {
    bodyText = summary.snippet || '(Empty message body)';
  }

  return {
    ...summary,
    bodyText,
    attachments,
  };
}

export async function listGmailDrafts(
  accessToken: string,
  maxResults = 15
): Promise<GmailDraftSummary[]> {
  const listRes = await gmailFetch<{ drafts?: { id: string; message?: { id: string } }[] }>(
    `${GMAIL_API_BASE}/drafts?maxResults=${maxResults}`,
    accessToken
  );

  const refs = listRes.drafts || [];
  if (refs.length === 0) return [];

  const details = await Promise.all(
    refs.map((d) =>
      gmailFetch<{ id: string; message: RawGmailMessage }>(
        `${GMAIL_API_BASE}/drafts/${encodeURIComponent(d.id)}?format=metadata`,
        accessToken
      )
    )
  );

  return details.map((d) => ({
    draftId: d.id,
    message: parseGmailSummary(d.message),
  }));
}

/**
 * Save a draft in Gmail (MUST be user-confirmed before calling if triggered automatically).
 */
export async function createGmailDraft(
  accessToken: string,
  input: { to: string; cc?: string; subject: string; bodyText: string }
): Promise<{ id: string }> {
  const raw = buildRawMimeEmail(input);
  return gmailFetch<{ id: string }>(`${GMAIL_API_BASE}/drafts`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ message: { raw } }),
  });
}

/**
 * Send an email via Gmail API (MUST be explicitly confirmed by the user beforehand).
 */
export async function sendGmailMessage(
  accessToken: string,
  input: { to: string; cc?: string; subject: string; bodyText: string }
): Promise<{ id: string; threadId?: string }> {
  const raw = buildRawMimeEmail(input);
  return gmailFetch<{ id: string; threadId?: string }>(
    `${GMAIL_API_BASE}/messages/send`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ raw }),
    }
  );
}

/**
 * Mark a Gmail message read or unread.
 */
export async function markGmailMessageRead(
  accessToken: string,
  messageId: string,
  markAsUnread: boolean
): Promise<void> {
  await gmailFetch(
    `${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}/modify`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(
        markAsUnread
          ? { addLabelIds: ['UNREAD'] }
          : { removeLabelIds: ['UNREAD'] }
      ),
    }
  );
}

/**
 * Move a Gmail message to Trash (MUST be explicitly confirmed by the user beforehand).
 */
export async function trashGmailMessage(
  accessToken: string,
  messageId: string
): Promise<void> {
  await gmailFetch(
    `${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}/trash`,
    accessToken,
    { method: 'POST' }
  );
}

/**
 * Build an email subject & body pre-populated with live MNA ECU Bench telemetry.
 */
export function buildDiagnosticEmailTemplate(payload: BenchDocTelemetryPayload): {
  subject: string;
  bodyText: string;
} {
  const dtcCount = payload.circuitSolution.activeDTCs.length;
  const dtcPrefix =
    dtcCount > 0
      ? `[${dtcCount} DTC${dtcCount > 1 ? 's' : ''}: ${payload.circuitSolution.activeDTCs
          .map((d) => d.code)
          .slice(0, 3)
          .join(', ')}]`
      : '[Nominal Bench]';

  return {
    subject: `ECU Bench Diagnostic Report — ${payload.ecuProfileLabel} ${dtcPrefix}`,
    bodyText: buildBenchReportText(payload),
  };
}
