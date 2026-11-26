/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React from 'react';
import { CheckCircle2, Download, RefreshCw, Smartphone } from 'lucide-react';
import type { PwaStateAndActions } from '../hooks/usePWA';

export interface PWAInstallButtonProps {
  pwa: PwaStateAndActions;
  onOpenInstallGuide: () => void;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  pwa,
  onOpenInstallGuide,
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, updateAvailable, promptInstall, applyUpdate } =
    pwa;

  if (updateAvailable) {
    return (
      <button
        type="button"
        onClick={applyUpdate}
        title="A new version of AutoElectric Lab Pro is ready. Click to update now."
        className={[
          'hw-btn inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[2px] border border-emerald-400 bg-emerald-500/20',
          compact ? 'min-h-[32px] px-2 py-1 text-[10px]' : 'min-h-[34px] px-2.5 py-1 text-[11px]',
          'font-mono font-bold uppercase tracking-wide text-emerald-200 hover:bg-emerald-500/30 cursor-pointer',
        ].join(' ')}
      >
        <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span>Update App</span>
      </button>
    );
  }

  // If already installed in standalone mode, show subtle status button that opens PWA Guide / Update check
  if (isInstalled) {
    return (
      <button
        type="button"
        onClick={onOpenInstallGuide}
        title="AutoElectric Lab Pro is running as an installed application. Click for PWA status & update controls."
        className={[
          'hw-btn inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[2px] border border-emerald-500/40 bg-[#132019]',
          compact ? 'min-h-[32px] px-2 py-1 text-[10px]' : 'min-h-[34px] px-2.5 py-1 text-[11px]',
          'font-mono font-semibold uppercase tracking-wide text-emerald-300 hover:border-emerald-400 cursor-pointer',
        ].join(' ')}
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <span className="hidden 2xl:inline">App Installed</span>
      </button>
    );
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const outcome = await promptInstall();
      if (outcome === 'unavailable') {
        onOpenInstallGuide();
      }
    } else {
      onOpenInstallGuide();
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleInstallClick()}
      aria-label={isIOS ? 'Install App on iPhone or iPad' : 'Install AutoElectric Lab Pro App'}
      title={
        isInstallable
          ? 'Install AutoElectric Lab Pro on your device for standalone offline-ready operation'
          : isIOS
            ? 'Install on iPhone/iPad via Safari Share -> Add to Home Screen'
            : 'Install AutoElectric Lab Pro App (Android, Desktop, iPhone/iPad)'
      }
      className={[
        'hw-btn inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[2px] border',
        compact ? 'min-h-[32px] px-2.5 py-1 text-[10px]' : 'min-h-[34px] px-2.5 py-1 text-[11px]',
        isInstallable
          ? 'border-amber-400/80 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
          : 'border-sky-500/50 bg-[#121d2b] text-sky-300 hover:border-sky-400',
        'font-mono font-bold uppercase tracking-wide cursor-pointer',
      ].join(' ')}
    >
      {isIOS ? (
        <Smartphone className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Download className="h-3.5 w-3.5 shrink-0" />
      )}
      <span>Install App</span>
    </button>
  );
};
