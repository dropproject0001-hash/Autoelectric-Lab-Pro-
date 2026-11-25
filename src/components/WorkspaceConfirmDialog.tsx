/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react';

export interface WorkspaceConfirmDialogProps {
  isOpen: boolean;
  tone?: 'info' | 'warning' | 'danger';
  title: string;
  description: string;
  details?: { label: string; value: string }[];
  previewText?: string;
  confirmLabel: string;
  isExecuting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const WorkspaceConfirmDialog: React.FC<WorkspaceConfirmDialogProps> = ({
  isOpen,
  tone = 'warning',
  title,
  description,
  details,
  previewText,
  confirmLabel,
  isExecuting = false,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  const iconWrapperClass =
    tone === 'danger'
      ? 'bg-rose-950 border-rose-600 text-rose-400'
      : tone === 'info'
        ? 'bg-[#0b1a12] border-emerald-600/80 text-emerald-400'
        : 'bg-[#1c1507] border-amber-600/80 text-amber-400';

  const confirmBtnClass =
    tone === 'danger'
      ? 'bg-rose-700 hover:bg-rose-600 border-rose-500 text-white'
      : tone === 'info'
        ? 'hw-btn-green'
        : 'hw-btn-amber';

  const borderClass =
    tone === 'danger'
      ? 'border-rose-500/70'
      : tone === 'info'
        ? 'border-emerald-500/60'
        : 'border-amber-500/70';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-confirm-title"
    >
      <div
        className={`hud-panel w-full max-w-lg border ${borderClass} rounded-[3px] shadow-2xl p-5 flex flex-col gap-4`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-[2px] flex items-center justify-center shrink-0 border ${iconWrapperClass}`}
          >
            {tone === 'danger' ? (
              <AlertTriangle className="w-5 h-5" />
            ) : tone === 'info' ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <ShieldAlert className="w-5 h-5" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 id="workspace-confirm-title" className="text-sm font-bold text-slate-100">
              {title}
            </h3>
            <p className="text-xs text-slate-300 font-sans mt-1 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {details && details.length > 0 && (
          <div className="hw-lcd-well rounded-[2px] p-3 space-y-1.5 text-xs">
            {details.map((row) => (
              <div key={row.label} className="flex items-start gap-2">
                <span className="text-slate-500 uppercase text-[10px] w-24 shrink-0 pt-0.5">
                  {row.label}
                </span>
                <span className="text-slate-200 font-mono break-all flex-1">{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {previewText && previewText.trim().length > 0 && (
          <pre className="hw-lcd-well max-h-40 overflow-y-auto rounded-[2px] p-2.5 text-[11px] text-slate-300 font-mono whitespace-pre-wrap">
            {previewText.slice(0, 1200)}
            {previewText.length > 1200 ? '\n... (truncated preview)' : ''}
          </pre>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2b313c]">
          <button
            type="button"
            disabled={isExecuting}
            onClick={onCancel}
            className="hw-btn px-3.5 py-2 rounded-[2px] disabled:opacity-50 text-slate-200 text-xs font-bold transition"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isExecuting}
            onClick={onConfirm}
            className={`hw-btn px-4 py-2 rounded-[2px] text-xs font-bold disabled:opacity-50 transition ${confirmBtnClass}`}
          >
            {isExecuting ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
