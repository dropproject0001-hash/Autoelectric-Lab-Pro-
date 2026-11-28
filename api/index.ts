/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { createAutoelectricApiApp } from '../src/server/createApiApp';

/**
 * Vercel Serverless Function entry point wrapping the full AutoElectric Lab Pro Express API.
 * All `/api/*` requests are routed here via `vercel.json`.
 */
const app = createAutoelectricApiApp();

export default app;
