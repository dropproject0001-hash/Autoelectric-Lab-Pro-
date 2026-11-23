import {
  buildUnifiedApiHeaders,
  getClientBearerToken,
  inspectAndHandleTrialErrorPayload,
} from './trialPinClientService';

export interface GroundedSearchSource {
  title: string;
  uri: string;
  domain: string;
}

export interface GroundedSearchResult {
  status: 'SUCCESS' | 'ERROR';
  answer: string;
  sources: GroundedSearchSource[];
  searchQueries: string[];
  model: string;
  attemptedModels?: string[];
  reroutedFrom?: string;
  preQuotaRerouted?: boolean;
  rerouteReason?: string;
  retryAfterSec?: number;
  timestamp: string;
  error?: string;
  errorCode?: string;
}

export interface GroundedSearchRequest {
  query: string;
  ecuModel?: string;
  dtcCode?: string;
  contextType?: string;
  customPrompt?: string;
}

export async function performGroundedSearch(
  req: GroundedSearchRequest
): Promise<GroundedSearchResult> {
  const bearerToken = await getClientBearerToken();
  if (!bearerToken) {
    const authMessage =
      'Enter an active 8-digit Trial PIN or Master Admin PIN to run live Google Search Grounding. Offline Repair Manuals & Local Assistant remain available.';
    return {
      status: 'ERROR',
      answer: authMessage,
      sources: [],
      searchQueries: [],
      model: 'gemini-4-hydrogen',
      timestamp: new Date().toISOString(),
      error: authMessage,
      errorCode: 'AUTH_REQUIRED',
    };
  }

  try {
    const headers = await buildUnifiedApiHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch('/api/autoelectric/grounded-search', {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
    });

    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      details?: string;
      answer?: string;
      sources?: GroundedSearchSource[];
      searchQueries?: string[];
      model?: string;
      attemptedModels?: string[];
      reroutedFrom?: string;
      preQuotaRerouted?: boolean;
      rerouteReason?: string;
      retryAfterSec?: number;
      timestamp?: string;
    };

    if (!response.ok) {
      inspectAndHandleTrialErrorPayload(response.status, data);
      let friendlyError =
        typeof data.error === 'string' && data.error.trim().length > 0
          ? data.error.trim()
          : `Grounded search failed (HTTP ${response.status}).`;

      const headerRetry = Number(response.headers.get('Retry-After'));
      const retryAfterSec =
        typeof data.retryAfterSec === 'number' && data.retryAfterSec > 0
          ? data.retryAfterSec
          : Number.isFinite(headerRetry) && headerRetry > 0
            ? headerRetry
            : undefined;

      if (response.status === 401) {
        friendlyError =
          data.error || 'Authentication required or session expired. Enter an active 8-digit Trial PIN or Master Admin PIN.';
      } else if (response.status === 429) {
        friendlyError =
          data.error ||
          (retryAfterSec
            ? `Gemini Search free-tier models are cooling down. Retry in ${retryAfterSec}s.`
            : 'Gemini API rate limit or quota exceeded (429). Please wait briefly before retrying.');
      } else if (
        response.status !== 403 &&
        response.status !== 400 &&
        response.status !== 404 &&
        response.status !== 504 &&
        typeof data.details === 'string' &&
        data.details.length > 0 &&
        !friendlyError.includes(data.details.slice(0, 30))
      ) {
        friendlyError = `${friendlyError} (${data.details.slice(0, 140)})`;
      }

      return {
        status: 'ERROR',
        answer: friendlyError,
        sources: [],
        searchQueries: [],
        model: data.model || 'gemini-4-hydrogen',
        attemptedModels: data.attemptedModels,
        retryAfterSec,
        timestamp: new Date().toISOString(),
        error: friendlyError,
        errorCode: data.code || `HTTP_${response.status}`,
      };
    }

    return {
      status: 'SUCCESS',
      answer: data.answer || '',
      sources: data.sources || [],
      searchQueries: data.searchQueries || [],
      model: data.model || 'gemini-4-hydrogen',
      attemptedModels: data.attemptedModels || [],
      reroutedFrom: data.reroutedFrom || undefined,
      preQuotaRerouted: Boolean(data.preQuotaRerouted),
      rerouteReason: data.rerouteReason,
      timestamp: data.timestamp || new Date().toISOString(),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown communication error';
    return {
      status: 'ERROR',
      answer: 'Failed to connect to Google Search Grounding service.',
      sources: [],
      searchQueries: [],
      model: 'gemini-4-hydrogen',
      timestamp: new Date().toISOString(),
      error: msg,
      errorCode: 'NETWORK_ERROR',
    };
  }
}
