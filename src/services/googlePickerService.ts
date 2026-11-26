/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { DriveFileItem } from './googleDriveService';

const GAPI_SCRIPT_URL = 'https://apis.google.com/js/api.js';

interface GooglePickerDocument {
  id?: string;
  name?: string;
  mimeType?: string;
  url?: string;
  sizeBytes?: number;
}

interface GooglePickerResponse {
  action?: string;
  docs?: GooglePickerDocument[];
}

interface GooglePickerBuilderInstance {
  addView: (view: unknown) => GooglePickerBuilderInstance;
  setOAuthToken: (token: string) => GooglePickerBuilderInstance;
  setCallback: (cb: (data: GooglePickerResponse) => void) => GooglePickerBuilderInstance;
  setOrigin: (origin: string) => GooglePickerBuilderInstance;
  setTitle: (title: string) => GooglePickerBuilderInstance;
  build: () => { setVisible: (visible: boolean) => void };
}

interface GooglePickerGlobal {
  picker?: {
    Action: { PICKED: string; CANCEL: string };
    ViewId: { DOCS: string; DOCS_IMAGES: string; PDFS: string; FOLDERS: string };
    PickerBuilder: new () => GooglePickerBuilderInstance;
  };
}

interface GapiGlobal {
  load: (api: string, callback: () => void | { callback: () => void; onerror?: () => void }) => void;
}

declare global {
  interface Window {
    gapi?: GapiGlobal;
    google?: GooglePickerGlobal;
  }
}

let gapiLoaderPromise: Promise<void> | null = null;

/**
 * Compute the safe origin string required by Google Picker inside sandboxed/iframe previews.
 * Uses the outermost ancestor origin when embedded in an iframe, falling back to window.location.origin.
 */
export function resolveGooglePickerOrigin(loc?: {
  origin?: string;
  ancestorOrigins?: ArrayLike<string>;
}): string {
  const target = loc ?? (typeof window !== 'undefined' ? window.location : undefined);
  if (!target) return '';
  if (target.ancestorOrigins && target.ancestorOrigins.length > 0) {
    const topOrigin = target.ancestorOrigins[target.ancestorOrigins.length - 1];
    if (typeof topOrigin === 'string' && topOrigin.startsWith('http')) {
      return topOrigin;
    }
  }
  return target.origin || '';
}

function loadGapiPickerLibrary(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Picker is only available in a browser environment.'));
  }

  if (window.google?.picker?.PickerBuilder) {
    return Promise.resolve();
  }

  if (gapiLoaderPromise) {
    return gapiLoaderPromise;
  }

  gapiLoaderPromise = new Promise<void>((resolve, reject) => {
    const loadPickerModule = () => {
      if (!window.gapi) {
        gapiLoaderPromise = null;
        reject(new Error('Google API script loaded without initializing gapi.'));
        return;
      }
      window.gapi.load('picker', () => {
        if (window.google?.picker?.PickerBuilder) {
          resolve();
        } else {
          gapiLoaderPromise = null;
          reject(new Error('Google Picker library failed to initialize.'));
        }
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${GAPI_SCRIPT_URL}"]`
    );
    if (existingScript) {
      if (window.gapi) {
        loadPickerModule();
      } else {
        existingScript.addEventListener('load', loadPickerModule, { once: true });
        existingScript.addEventListener(
          'error',
          () => {
            gapiLoaderPromise = null;
            reject(new Error('Failed to load Google API script for Google Picker.'));
          },
          { once: true }
        );
      }
      return;
    }

    const script = document.createElement('script');
    script.src = GAPI_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = loadPickerModule;
    script.onerror = () => {
      gapiLoaderPromise = null;
      reject(new Error('Failed to load Google Picker script. Check network connectivity.'));
    };
    document.head.appendChild(script);
  });

  return gapiLoaderPromise;
}

export interface OpenGooglePickerOptions {
  title?: string;
}

/**
 * Open the official Google Drive Picker dialog using ONLY the user's OAuth access token.
 * Per Google Picker integration rules, no developer key is ever passed.
 */
export async function openGoogleDrivePicker(
  accessToken: string,
  options: OpenGooglePickerOptions = {}
): Promise<DriveFileItem | null> {
  if (!accessToken.trim()) {
    throw new Error('Sign in with Google to authorize Google Picker.');
  }

  await loadGapiPickerLibrary();

  const pickerApi = window.google?.picker;
  if (!pickerApi?.PickerBuilder) {
    throw new Error('Google Picker is unavailable in this browser session.');
  }

  const pickerOrigin = resolveGooglePickerOrigin();

  return new Promise<DriveFileItem | null>((resolve) => {
    const picker = new pickerApi.PickerBuilder()
      .addView(pickerApi.ViewId.DOCS)
      .setOAuthToken(accessToken)
      .setOrigin(pickerOrigin)
      .setTitle(options.title || 'Select ECU Bench File from Google Drive')
      .setCallback((data: GooglePickerResponse) => {
        if (data.action === pickerApi.Action.PICKED && data.docs && data.docs.length > 0) {
          const picked = data.docs[0];
          if (picked.id) {
            resolve({
              id: picked.id,
              name: picked.name || 'Picked Drive File',
              mimeType: picked.mimeType || 'application/octet-stream',
              size: typeof picked.sizeBytes === 'number' ? String(picked.sizeBytes) : undefined,
              webViewLink: picked.url,
            });
            return;
          }
        }
        if (data.action === pickerApi.Action.CANCEL || data.action === pickerApi.Action.PICKED) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}
