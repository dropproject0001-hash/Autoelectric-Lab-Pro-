/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createAutoelectricApiApp } from './createApiApp';

/**
 * Disable Vercel's default bodyParser so Express's route-scoped JSON parsers
 * (smallJsonParser / imageJsonParser / csvImportJsonParser) read the raw stream
 * cleanly without hanging or double-parsing on POST login/AI routes.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

const app = createAutoelectricApiApp();

/**
 * Restores the original `/api/...` pathname when Vercel rewrites `/api/(.*)`
 * to `/api?__vercel_path=$1`, preserving all other query parameters.
 */
function restoreRewrittenApiUrl(req: IncomingMessage): void {
  const rawUrl = req.url || '/';
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    const forwardedPath = parsed.searchParams.get('__vercel_path');
    if (forwardedPath !== null) {
      parsed.searchParams.delete('__vercel_path');
      const cleanSubPath = forwardedPath.replace(/^\/+/, '');
      const remainingQuery = parsed.searchParams.toString();
      req.url = `/api/${cleanSubPath}${remainingQuery ? `?${remainingQuery}` : ''}`;
    }
  } catch {
    // Leave req.url untouched if unparseable
  }
}

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  restoreRewrittenApiUrl(req);
  return new Promise<void>((resolve, reject) => {
    const onDone = () => {
      res.off('finish', onDone);
      res.off('close', onDone);
      res.off('error', onErr);
      resolve();
    };
    const onErr = (err: Error) => {
      res.off('finish', onDone);
      res.off('close', onDone);
      res.off('error', onErr);
      reject(err);
    };
    res.on('finish', onDone);
    res.on('close', onDone);
    res.on('error', onErr);
    app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
  });
}
