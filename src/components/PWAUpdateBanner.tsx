/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useState } from 'react';
import { RefreshCw, WifiOff, X } from 'lucide-react';
import type { PwaStateAndActions } from '../hooks/usePWA';

export interface PWAUpdateBannerProps {
  pwa: PwaStateAndActions;
}

export const PWAUpdateBanner: React.FC<PWAUpdateBannerProps> = ({ pwa }) => {
  const [dismissedUpdate, setDismissedUpdate] = useState(false);
  const [dismissedOffline, setDismissedOffline] = useState(false);

  const showUpdate = pwa.updateAvailable && !dismissedUpdate;
  const showOffline = !pwa.isOnline && !dismissedOffline;

  if (!showUpdate && !showOffline) {
    return null;
  }

  return (
    <div className="space-y-1 px-2 pt-1.5 sm:px-3 shrink-0">
      {showUpdate && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 rounded-[2px] border border-emerald-500/60 bg-[#0d1f18] px-3 py-1.5 font-mono text-[11px] text-emerald-200"
        >
          <div className="flex items-center gap-2">
            <RefreshCw className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span>
              <strong>New Version Available:</strong> An updated build of AutoElectric Lab Pro has
              been downloaded and is ready to activate.
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={pwa.applyUpdate}
              className="hw-btn rounded-[2px] border border-emerald-400 bg-emerald-500/25 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-100 hover:bg-emerald-500/40 cursor-pointer"
            >
              Update Now
            </button>
            <button
              type="button"
              onClick={() => setDismissedUpdate(true)}
              aria-label="Dismiss update notification"
              className="rounded-[2px] p-1 text-emerald-300/70 hover:text-white cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {showOffline && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 rounded-[2px] border border-amber-500/60 bg-[#1e170d] px-3 py-1.5 font-mono text-[11px] text-amber-200"
        >
          <div className="flex items-center gap-2">
            <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span>
              <strong>Offline App Shell Active:</strong> Local MNA circuit simulation, oscilloscope,
              pinouts, and Offline Assistant are available. Cloud auth, license activation, and live
              AI require internet.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDismissedOffline(true)}
            aria-label="Dismiss offline banner"
            className="rounded-[2px] p-1 text-amber-300/70 hover:text-white cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
