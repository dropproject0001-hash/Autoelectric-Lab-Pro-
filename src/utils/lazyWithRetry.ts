/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React from 'react';

const TRANSIENT_IMPORT_ERROR_RE =
  /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk|networkerror/i;

export function isTransientDynamicImportError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return TRANSIENT_IMPORT_ERROR_RE.test(msg);
}

/**
 * Retries transient dynamic ESM/chunk import failures (e.g., Vite optimizeDeps warm-up
 * or temporary proxy hiccups) with short backoff before failing.
 */
export async function importWithRetry<T>(
  importer: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 350
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await importer();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !isTransientDynamicImportError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * Creates a lazy component with automatic transient import retries and clean recovery
 * when an ErrorBoundary resets (avoids React.lazy permanently caching a failed Promise,
 * and avoids creating React.lazy inside component hook state which resets during Suspense retries).
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  maxRetries = 2
): React.FC<React.ComponentProps<T>> {
  let currentLazy: React.LazyExoticComponent<T> | null = null;
  let shouldReset = false;

  const loadModule = () =>
    importWithRetry(importer, maxRetries).catch((err) => {
      shouldReset = true;
      throw err;
    });

  const RetryableLazyWrapper: React.FC<React.ComponentProps<T>> = (props) => {
    if (!currentLazy || shouldReset) {
      shouldReset = false;
      currentLazy = React.lazy(loadModule);
    }
    return React.createElement(currentLazy, props as React.ComponentProps<T>);
  };
  return RetryableLazyWrapper;
}
