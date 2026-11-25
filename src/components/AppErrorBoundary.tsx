/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { Component } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw, X } from 'lucide-react';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  variant?: 'root' | 'modal';
  label?: string;
  resetKey?: string | number | boolean;
  onClose?: () => void;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected rendering error.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const scope = this.props.label || (this.props.variant === 'modal' ? 'Modal' : 'Workbench');
    console.error(`[AppErrorBoundary:${scope}] Uncaught UI error:`, error, info);
  }

  componentDidUpdate(prevProps: AppErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const label = this.props.label || 'AutoElectric Lab Workbench';

    if (this.props.variant === 'modal') {
      return (
        <div
          role="alert"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-mono text-slate-100"
        >
          <div className="hud-panel w-full max-w-md rounded-[3px] border border-rose-500/60 bg-[#12161d] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-[#2b313c] pb-2.5">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{label} Error</span>
              </h2>
              {this.props.onClose && (
                <button
                  type="button"
                  onClick={this.props.onClose}
                  className="hw-btn rounded-[2px] p-1 text-slate-400 hover:text-white cursor-pointer"
                  aria-label={`Close ${label}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-300 font-sans leading-relaxed">
              This panel encountered an unexpected runtime error. Your live workbench state remains intact.
            </p>
            {this.state.errorMessage && (
              <p className="mt-2 rounded-[2px] hw-lcd-well px-2.5 py-1.5 text-[11px] text-rose-200 break-words">
                {this.state.errorMessage}
              </p>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={this.handleRetry}
                className="hw-btn hw-btn-amber inline-flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 text-xs font-bold cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Retry Panel</span>
              </button>
              {this.props.onClose && (
                <button
                  type="button"
                  onClick={this.props.onClose}
                  className="hw-btn inline-flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 text-xs text-slate-200 cursor-pointer"
                >
                  <span>Close</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        role="alert"
        className="flex min-h-[100dvh] w-full items-center justify-center bg-[#0b0e13] p-4 font-mono text-slate-100"
      >
        <div className="hud-panel w-full max-w-lg rounded-[3px] border border-rose-500/60 bg-[#12161d] p-5 shadow-2xl">
          <h1 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{label} Interrupted</span>
          </h1>
          <p className="mt-2.5 text-xs text-slate-300 font-sans leading-relaxed">
            An unexpected UI or session initialization error interrupted rendering. You can retry the current view or reload the application.
          </p>
          {this.state.errorMessage && (
            <pre className="mt-3 max-h-36 overflow-auto rounded-[2px] hw-lcd-well p-2.5 text-[11px] text-rose-200 whitespace-pre-wrap break-words">
              {this.state.errorMessage}
            </pre>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="hw-btn hw-btn-amber inline-flex items-center gap-1.5 rounded-[2px] px-3 py-2 text-xs font-bold cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry Workbench</span>
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="hw-btn inline-flex items-center gap-1.5 rounded-[2px] px-3 py-2 text-xs text-slate-200 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
