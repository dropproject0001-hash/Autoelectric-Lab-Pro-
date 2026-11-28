/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

/**
 * Zero-dependency Vercel Serverless Function entrypoint.
 * Dynamically loads the pre-bundled Express API (`./_bundle.mjs`) inside a
 * try/catch so any cold-start or dependency error surfaces as structured JSON
 * instead of an opaque FUNCTION_INVOCATION_FAILED 500.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

let cachedHandler = null;

export default async function handler(req, res) {
  try {
    if (!cachedHandler) {
      const mod = await import('./_bundle.mjs');
      cachedHandler = mod.default || mod;
    }
    return await cachedHandler(req, res);
  } catch (err) {
    console.error('[Vercel API Boot Error]', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          status: 'ERROR',
          code: 'API_BOOT_ERROR',
          name: err instanceof Error ? err.name : 'Error',
          message: err instanceof Error ? err.message : String(err),
          errorCode: err && typeof err === 'object' && 'code' in err ? err.code : null,
        })
      );
    }
  }
}
