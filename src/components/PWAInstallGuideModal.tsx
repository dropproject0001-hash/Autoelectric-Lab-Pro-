/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  HelpCircle,
  Laptop,
  RefreshCw,
  Share,
  ShieldCheck,
  Smartphone,
  Wrench,
  X,
} from 'lucide-react';
import type { PwaStateAndActions } from '../hooks/usePWA';
import { APP_LOGO_SRC } from '../constants/branding';

export interface PWAInstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  pwa: PwaStateAndActions;
}

export const PWAInstallGuideModal: React.FC<PWAInstallGuideModalProps> = ({
  isOpen,
  onClose,
  pwa,
}) => {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDirectInstall = async () => {
    setStatusMessage(null);
    const outcome = await pwa.promptInstall();
    if (outcome === 'accepted') {
      setStatusMessage('AutoElectric Lab Pro installation accepted!');
    } else if (outcome === 'dismissed') {
      setStatusMessage('Installation prompt was dismissed. You can click Install App again anytime.');
    } else {
      setStatusMessage(
        'Direct install prompt is not currently queued by the browser. Follow the step-by-step instructions below for your device.'
      );
    }
  };

  const handleManualUpdateCheck = async () => {
    setStatusMessage(null);
    const found = await pwa.checkForUpdates();
    if (found) {
      setStatusMessage('A new version is ready! Click "Apply Update Now" to reload.');
    } else {
      setStatusMessage('You are running the latest version of AutoElectric Lab Pro.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Install AutoElectric Lab Pro Progressive Web App Guide"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[4px] border border-[#324158] bg-[#0b1320] text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#223044] bg-[#071426] px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src={APP_LOGO_SRC}
              alt="AutoElectric Lab Pro"
              className="h-8 w-8 rounded-[3px] border border-[#364863] bg-[#071426] object-contain p-0.5"
            />
            <div>
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-slate-100">
                Install AutoElectric Lab Pro (PWA) &amp; Offline Workstation Guide
              </h2>
              <p className="font-mono text-[10px] text-slate-400">
                Standalone App Mode · Android · Samsung Internet · Windows/Desktop · iPhone/iPad
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close PWA installation guide"
            className="rounded-[2px] border border-[#344256] bg-[#131d2c] p-1.5 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 font-mono text-xs">
          {/* Live Telemetry & One-Click Install / Update Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-[#26364d] bg-[#0f1928] p-3.5">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase text-slate-400">App Status:</span>
                {pwa.isInstalled ? (
                  <span className="inline-flex items-center gap-1 rounded-[2px] border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    INSTALLED (STANDALONE MODE)
                  </span>
                ) : pwa.isInstallable ? (
                  <span className="inline-flex items-center gap-1 rounded-[2px] border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    READY FOR ONE-CLICK INSTALL
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-[2px] border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                    BROWSER TAB MODE ({pwa.platform.replace('_', ' ')})
                  </span>
                )}
                <span
                  className={`rounded-[2px] border px-2 py-0.5 text-[10px] font-bold ${
                    pwa.swRegistered
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-slate-600 bg-slate-800 text-slate-400'
                  }`}
                >
                  SW: {pwa.swRegistered ? 'ACTIVE' : 'INITIALIZING'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Short Name: <strong className="text-slate-200">AutoElec Lab</strong> · Theme:{' '}
                <strong className="text-slate-200">#071426</strong> · Orientation:{' '}
                <strong className="text-slate-200">Portrait &amp; Landscape</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!pwa.isInstalled && pwa.isInstallable && (
                <button
                  type="button"
                  onClick={() => void handleDirectInstall()}
                  className="hw-btn inline-flex items-center gap-1.5 rounded-[2px] border border-amber-400 bg-amber-500/25 px-3 py-2 text-xs font-bold uppercase text-amber-200 hover:bg-amber-500/35 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>Install App Now</span>
                </button>
              )}

              {pwa.updateAvailable ? (
                <button
                  type="button"
                  onClick={pwa.applyUpdate}
                  className="hw-btn inline-flex items-center gap-1.5 rounded-[2px] border border-emerald-400 bg-emerald-500/25 px-3 py-2 text-xs font-bold uppercase text-emerald-200 hover:bg-emerald-500/35 cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Apply Update Now</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleManualUpdateCheck()}
                  disabled={pwa.checkingUpdate}
                  className="hw-btn inline-flex items-center gap-1.5 rounded-[2px] border border-[#364863] bg-[#162234] px-3 py-2 text-[11px] font-semibold uppercase text-slate-200 hover:border-sky-400 cursor-pointer"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${pwa.checkingUpdate ? 'animate-spin' : ''}`}
                  />
                  <span>Check for Update</span>
                </button>
              )}
            </div>
          </div>

          {statusMessage && (
            <div className="rounded-[2px] border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-amber-200">
              {statusMessage}
            </div>
          )}

          {/* Platform-by-Platform Installation Cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* 1. Android Chrome */}
            <div
              className={`rounded-[3px] border p-3.5 ${
                pwa.platform === 'ANDROID_CHROME'
                  ? 'border-amber-400/70 bg-[#111e30]'
                  : 'border-[#25344a] bg-[#0e1726]'
              }`}
            >
              <div className="flex items-center gap-2 text-amber-300 font-bold uppercase">
                <Smartphone className="h-4 w-4 shrink-0" />
                <span>1. Android Chrome Installation</span>
              </div>
              <ol className="mt-2 list-inside list-decimal space-y-1.5 text-[11px] text-slate-300">
                <li>
                  Tap the <strong>Install App</strong> button in the top AutoElectric Lab Pro toolbar
                  and confirm <strong>Install</strong> in the prompt.
                </li>
                <li>
                  If the prompt was dismissed, tap the Chrome menu icon (<strong>⋮</strong>) in the
                  top-right corner.
                </li>
                <li>
                  Select <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                </li>
                <li>
                  Launch <strong>AutoElec Lab</strong> from your Android app drawer for full-screen
                  standalone bench operation.
                </li>
              </ol>
            </div>

            {/* 2. Samsung Internet */}
            <div
              className={`rounded-[3px] border p-3.5 ${
                pwa.platform === 'SAMSUNG_INTERNET'
                  ? 'border-amber-400/70 bg-[#111e30]'
                  : 'border-[#25344a] bg-[#0e1726]'
              }`}
            >
              <div className="flex items-center gap-2 text-sky-300 font-bold uppercase">
                <Smartphone className="h-4 w-4 shrink-0" />
                <span>2. Samsung Internet Installation</span>
              </div>
              <ol className="mt-2 list-inside list-decimal space-y-1.5 text-[11px] text-slate-300">
                <li>
                  Open AutoElectric Lab Pro in <strong>Samsung Internet</strong> on your Galaxy phone
                  or tablet.
                </li>
                <li>
                  Tap the <strong>Install App</strong> button in the app header, or tap the{' '}
                  <strong>Download / +</strong> icon in the address bar.
                </li>
                <li>
                  Alternatively, tap the bottom menu icon (<strong>≡</strong>) &rarr;{' '}
                  <strong>Add page to</strong> &rarr; <strong>Home screen</strong>.
                </li>
              </ol>
            </div>

            {/* 3. Windows & Desktop Chrome / Edge */}
            <div
              className={`rounded-[3px] border p-3.5 ${
                pwa.platform === 'DESKTOP_CHROMIUM'
                  ? 'border-amber-400/70 bg-[#111e30]'
                  : 'border-[#25344a] bg-[#0e1726]'
              }`}
            >
              <div className="flex items-center gap-2 text-emerald-300 font-bold uppercase">
                <Laptop className="h-4 w-4 shrink-0" />
                <span>3. Windows, macOS &amp; Desktop Chrome / Edge</span>
              </div>
              <ol className="mt-2 list-inside list-decimal space-y-1.5 text-[11px] text-slate-300">
                <li>
                  Click the <strong>Install App</strong> button in the top right of the AutoElectric
                  Lab Pro navigation bar.
                </li>
                <li>
                  Or click the <strong>Install AutoElectric Lab Pro</strong> icon (monitor with
                  downward arrow) on the right side of the browser address bar.
                </li>
                <li>
                  Click <strong>Install</strong> to pin the workstation to your Windows Taskbar,
                  Start Menu, or Desktop.
                </li>
              </ol>
            </div>

            {/* 4. iPhone & iPad Safari */}
            <div
              className={`rounded-[3px] border p-3.5 ${
                pwa.isIOS
                  ? 'border-amber-400/70 bg-[#111e30]'
                  : 'border-[#25344a] bg-[#0e1726]'
              }`}
            >
              <div className="flex items-center gap-2 text-amber-300 font-bold uppercase">
                <Share className="h-4 w-4 shrink-0" />
                <span>4. iPhone &amp; iPad (Safari) Installation</span>
              </div>
              <ol className="mt-2 list-inside list-decimal space-y-1.5 text-[11px] text-slate-300">
                <li>
                  Open AutoElectric Lab Pro in <strong>Safari</strong> on iPhone or iPad (Apple iOS
                  does not support automatic <code>beforeinstallprompt</code> banners).
                </li>
                <li>
                  Tap the <strong>Share</strong> button (square with upward arrow{' '}
                  <strong>[↑]</strong>) in the Safari toolbar.
                </li>
                <li>
                  Scroll down the share sheet and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Confirm the title <strong>AutoElec Lab</strong> and tap <strong>Add</strong> in the
                  top-right corner.
                </li>
              </ol>
            </div>
          </div>

          {/* 5. Updating & 6. Troubleshooting */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-[3px] border border-[#25344a] bg-[#0e1726] p-3.5">
              <div className="flex items-center gap-2 font-bold uppercase text-emerald-300">
                <RefreshCw className="h-4 w-4 shrink-0" />
                <span>5. How to Update the Installed Application</span>
              </div>
              <ul className="mt-2 list-inside list-disc space-y-1.5 text-[11px] text-slate-300">
                <li>
                  Whenever you open AutoElectric Lab Pro online, the Service Worker automatically
                  checks for new diagnostic engine or pinout releases in the background.
                </li>
                <li>
                  To protect active bench measurements, updates are never forced mid-session. A green{' '}
                  <strong>New Version Available — Update Now</strong> banner appears at the top of
                  the workspace.
                </li>
                <li>
                  Click <strong>Update Now</strong> (or click <strong>Check for Update</strong>{' '}
                  above) to activate the latest version and automatically clean up older caches.
                </li>
              </ul>
            </div>

            <div className="rounded-[3px] border border-[#25344a] bg-[#0e1726] p-3.5">
              <div className="flex items-center gap-2 font-bold uppercase text-amber-300">
                <Wrench className="h-4 w-4 shrink-0" />
                <span>6. Troubleshooting Installation Issues</span>
              </div>
              <ul className="mt-2 list-inside list-disc space-y-1.5 text-[11px] text-slate-300">
                <li>
                  <strong>Install button opens this guide instead of a popup:</strong> Check if the
                  app is already installed on your device, or make sure you are not in{' '}
                  <strong>Incognito / Private Browsing</strong> mode.
                </li>
                <li>
                  <strong>AI Studio Preview Frame Note:</strong> Browsers only trigger native OS
                  install prompts when the app is opened in its own top-level browser tab (click the
                  open-in-new-tab icon or visit the published Cloud Run URL directly).
                </li>
                <li>
                  <strong>iPhone/iPad:</strong> Ensure you use Safari&apos;s{' '}
                  <strong>Share &rarr; Add to Home Screen</strong> menu.
                </li>
              </ul>
            </div>
          </div>

          {/* Security & Offline Policy Footer */}
          <div className="flex items-start gap-2.5 rounded-[3px] border border-[#26364d] bg-[#09111d] p-3 text-[11px] text-slate-300">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <strong className="text-slate-100">Security &amp; Offline Integrity Guarantee:</strong>{' '}
              The Service Worker caches only the static application shell and core workbench UI.
              Firebase Authentication tokens, License Key activation/validation responses,
              Administrator endpoints, and Gemini AI requests are strictly <strong>Network-Only</strong>{' '}
              and are never cached or bypassed in offline mode.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
