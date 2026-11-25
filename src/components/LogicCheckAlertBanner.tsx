/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import type { LogicCheckAlert } from '../simulation/ecu/LogicCheckEngine';

export interface LogicCheckAlertBannerProps {
  alerts: LogicCheckAlert[];
  onFocusPin: (pinId: string) => void;
  onOpenLogicCheck: () => void;
  onDismiss: () => void;
}

export const LogicCheckAlertBanner: React.FC<LogicCheckAlertBannerProps> = ({
  alerts,
  onFocusPin,
  onOpenLogicCheck,
  onDismiss,
}) => {
  if (alerts.length === 0) return null;

  const primary = alerts[0];
  const isCritical = alerts.some((a) => a.severity === 'CRITICAL');
  const additionalCount = alerts.length - 1;

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="logic-check-alert-banner"
      className={`shrink-0 rounded-[2px] border px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shadow-lg ${
        isCritical
          ? 'border-rose-500/70 bg-rose-950/90 text-rose-100'
          : 'border-amber-500/70 bg-amber-950/85 text-amber-100'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div
          className={`w-7 h-7 rounded-[2px] border flex items-center justify-center shrink-0 ${
            isCritical
              ? 'border-rose-400/70 bg-rose-900/70 text-rose-200'
              : 'border-amber-400/70 bg-amber-900/70 text-amber-200'
          }`}
        >
          {isCritical ? (
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
          ) : (
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-hud text-[11px] font-bold uppercase tracking-wider">
              Logic Check Alert
            </span>
            <span className="font-mono font-bold truncate">{primary.title}</span>
            {additionalCount > 0 && (
              <span className="font-mono text-[11px] opacity-90">
                (+{additionalCount} more pin{additionalCount === 1 ? '' : 's'})
              </span>
            )}
          </div>
          <p className="font-mono text-[11px] opacity-90 truncate tabular-nums">
            {primary.detail}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onFocusPin(primary.pinId)}
          className="hw-btn rounded-[2px] px-2.5 py-1 text-[11px] font-mono font-semibold text-white transition whitespace-nowrap cursor-pointer"
        >
          Inspect #{primary.pinNumber}
        </button>
        <button
          type="button"
          onClick={onOpenLogicCheck}
          className="hw-btn hw-btn-amber rounded-[2px] px-2.5 py-1 text-[11px] font-mono font-semibold transition whitespace-nowrap cursor-pointer"
        >
          Open Logic Check
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss Logic Check alert banner"
          title="Acknowledge alert"
          className="hw-btn p-1.5 rounded-[2px] text-slate-200 transition cursor-pointer"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
