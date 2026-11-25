/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useState } from 'react';
import { Clock, CloudOff, RefreshCw } from 'lucide-react';
import { formatTrialCountdown, useTrialAccess } from '../context/TrialAccessContext';
import { EcuPin, WireConnection } from '../types/ecu';
import { CircuitSolution } from '../utils/circuitSolver';
import type { DiagnosticPanelMode } from '../utils/diagnosticWorkflow';
import { LabTab } from './LabTopNav';
import { PerformanceMonitorWidget } from './PerformanceMonitorWidget';
import { ConnectionHealthWidget } from './ConnectionHealthWidget';
import {
  CloudSyncStatusSnapshot,
  getSyncStatusSnapshot,
  subscribeSyncStatus,
} from '../services/benchStorageService';
import { formatCloudSyncError } from '../utils/cloudSyncErrorUtils';
import { LabDrawerIcon } from './icons/LabDrawerIcons';

export interface FooterSyncIndicatorDescriptor {
  visible: boolean;
  tone: 'SYNCING' | 'ERROR' | 'REQUEUED' | 'QUEUED';
  label: string;
  tooltip: string;
  ariaLabel: string;
}

export function describeFooterSyncIndicator(
  syncStatus: CloudSyncStatusSnapshot
): FooterSyncIndicatorDescriptor {
  const pending = syncStatus.pendingCount;
  const failed = syncStatus.failedCount ?? 0;
  const visible = pending > 0 || syncStatus.state === 'ERROR' || syncStatus.state === 'SYNCING';

  const hasFaultBuilderPending = Boolean(
    syncStatus.pendingCollections?.includes('faultSequences')
  );
  const scopeLabel = hasFaultBuilderPending ? 'Fault Builder & bench writes' : 'Bench writes';

  const sanitizedErr = syncStatus.lastError
    ? formatCloudSyncError(new Error(syncStatus.lastError), { isPinOnlyLocalMode: false }) ||
      syncStatus.lastError.replace(/^\{.*\}$/, 'Cloud sync deferred while offline')
    : null;

  if (syncStatus.state === 'SYNCING') {
    const label = `Syncing (${pending})`;
    const tooltip = `${scopeLabel} syncing from IndexedDB to cloud (${pending} pending).`;
    return { visible, tone: 'SYNCING', label, tooltip, ariaLabel: tooltip };
  }

  if (syncStatus.state === 'ERROR') {
    const label = pending > 0 ? `Sync Retry (${pending})` : 'Sync Error';
    const detail = sanitizedErr ? ` Last issue: ${sanitizedErr}.` : '';
    const tooltip =
      pending > 0
        ? `${scopeLabel} saved safely in IndexedDB and re-queued for retry (${pending} pending).${detail} Click to retry now.`
        : `Cloud sync encountered an error.${detail} Click to retry.`;
    return { visible, tone: 'ERROR', label, tooltip, ariaLabel: tooltip };
  }

  if (failed > 0 && pending > 0) {
    const label = `Re-queued (${pending})`;
    const retryNote =
      typeof syncStatus.nextRetryAtMs === 'number'
        ? ' Auto-retry scheduled.'
        : ' Will retry automatically when online.';
    const detail = sanitizedErr ? ` (${sanitizedErr})` : '';
    const tooltip = `${scopeLabel} saved locally in IndexedDB after background sync interruption and re-queued (${pending} pending).${retryNote}${detail} Click to retry now.`;
    return { visible, tone: 'REQUEUED', label, tooltip, ariaLabel: tooltip };
  }

  const label = `Sync (${pending})`;
  const tooltip = `${scopeLabel} saved locally in IndexedDB (${pending} pending cloud upload). Click to sync now.`;
  return { visible, tone: 'QUEUED', label, tooltip, ariaLabel: tooltip };
}

interface LabStatusFooterProps {
  activeTab: LabTab;
  selectedPin: EcuPin | undefined;
  circuitSolution: CircuitSolution;
  wires: WireConnection[];
  showDiagnosticGuide: boolean;
  diagnosticPanelMode?: DiagnosticPanelMode;
  onSelectDiagnosticPanel?: (mode: DiagnosticPanelMode) => void;
  workflowMandatoryChecked?: number;
  workflowMandatoryTotal?: number;
  logicCheckAlertCount?: number;
  isLogicCheckCritical?: boolean;
  onToggleDiagnosticGuide: () => void;
  isVoiceLogOpen?: boolean;
  onToggleVoiceLog?: () => void;
  voiceLogCount?: number;
  onQuickAttachRedProbe: () => void;
  onQuickAttachBlackProbe: () => void;
  onRetryCloudSync?: () => void;
}

export const LabStatusFooter: React.FC<LabStatusFooterProps> = ({
  activeTab,
  selectedPin,
  circuitSolution,
  wires,
  showDiagnosticGuide,
  diagnosticPanelMode = 'WORKFLOW',
  onSelectDiagnosticPanel,
  workflowMandatoryChecked = 0,
  workflowMandatoryTotal = 4,
  logicCheckAlertCount = 0,
  isLogicCheckCritical = false,
  onToggleDiagnosticGuide,
  isVoiceLogOpen = false,
  onToggleVoiceLog,
  voiceLogCount = 0,
  onQuickAttachRedProbe,
  onQuickAttachBlackProbe,
  onRetryCloudSync,
}) => {
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatusSnapshot>(() => getSyncStatusSnapshot());
  const { accessMode, remainingSeconds, isLowTimeWarning, isAdminUnlocked, openAccessModal } =
    useTrialAccess();

  useEffect(() => {
    return subscribeSyncStatus(setSyncStatus);
  }, []);

  const isWorkflowActive = showDiagnosticGuide && diagnosticPanelMode === 'WORKFLOW';
  const isLogicCheckActive = showDiagnosticGuide && diagnosticPanelMode === 'LOGIC_CHECK';
  const isMnaGuideActive = showDiagnosticGuide && diagnosticPanelMode === 'MNA_GUIDE';
  const hasFaults = circuitSolution.activeDTCs.length > 0;

  const syncIndicator = describeFooterSyncIndicator(syncStatus);
  const showSyncBadge = syncIndicator.visible;

  const isCriticalLowTime =
    isLowTimeWarning && remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= 300;
  const formattedFooterCountdown =
    remainingSeconds !== null && remainingSeconds < 3600
      ? `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`
      : formatTrialCountdown(remainingSeconds);

  return (
    <footer className="relative min-h-[36px] bg-gradient-to-b from-[#0b1526]/84 to-[#060c17]/90 backdrop-blur-md border-t border-[#203653] px-2.5 sm:px-3.5 lg:px-4 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 text-[10.5px] font-mono shrink-0 text-[#d9e8fa] overflow-x-auto scrollbar-none">
      {/* Left Existing Bench Telemetry Strip */}
      <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap lg:flex-nowrap min-w-0">
        <span className="inline-flex items-center gap-1.5 text-[#eaf3ff] whitespace-nowrap min-w-0">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full shrink-0 ${
              hasFaults
                ? 'bg-[#ff4d62] shadow-[0_0_8px_rgba(255,77,98,0.75)]'
                : 'bg-[#20d889] shadow-[0_0_8px_rgba(32,216,137,0.75)]'
            }`}
          />
          <span className="text-[#91a4bd]">TARGET:</span>
          <strong className="font-semibold text-[#19c8f5] truncate max-w-[130px] xl:max-w-[190px]">
            {selectedPin ? `#${selectedPin.pinNumber} ${selectedPin.label}` : 'None'}
          </strong>
        </span>

        <span className="text-[#203653] hidden xs:inline">|</span>

        <span className="whitespace-nowrap tabular-nums text-[#91a4bd]">
          DMM:{' '}
          <strong className="text-[#ffb020] font-semibold">
            {circuitSolution.multimeterReading.display} {circuitSolution.multimeterReading.unit}
          </strong>
        </span>

        <span className="text-[#203653] hidden xl:inline">|</span>

        <span className="whitespace-nowrap hidden xl:inline tabular-nums text-[#91a4bd]">
          HARNESS:{' '}
          <strong className="text-[#eaf3ff]">
            {wires.filter((w) => !w.isCut).length}/{wires.length}
          </strong>
        </span>

        {showSyncBadge && (
          <button
            type="button"
            data-testid="footer-sync-status-btn"
            role="status"
            aria-live="polite"
            aria-label={syncIndicator.ariaLabel}
            onClick={onRetryCloudSync}
            disabled={syncStatus.state === 'SYNCING'}
            className={`hw-btn text-[10px] flex items-center gap-1.5 px-2 py-0.5 rounded-md whitespace-nowrap tabular-nums cursor-pointer ${
              syncIndicator.tone === 'ERROR'
                ? 'bg-rose-950/75 border-[#ff4d62]/70 text-rose-200'
                : syncIndicator.tone === 'SYNCING'
                  ? 'hw-btn-green'
                  : 'hw-btn-amber'
            }`}
            title={syncIndicator.tooltip}
          >
            {syncIndicator.tone === 'SYNCING' ? (
              <span className="relative inline-flex h-3 w-3 items-center justify-center">
                <span
                  aria-hidden="true"
                  className="absolute inline-flex h-full w-full rounded-full bg-[#20d889]/60 animate-ping"
                />
                <RefreshCw className="relative w-3 h-3 animate-spin" aria-hidden="true" />
              </span>
            ) : (
              <CloudOff className="w-3 h-3 shrink-0" aria-hidden="true" />
            )}
            <span>{syncIndicator.label}</span>
          </button>
        )}
      </div>

      {/* Right Existing Bench Utility Controls */}
      <div className="flex flex-wrap lg:flex-nowrap items-center gap-1.5 shrink-0">
        {onToggleVoiceLog && (
          <button
            type="button"
            onClick={onToggleVoiceLog}
            aria-expanded={isVoiceLogOpen}
            className={`hidden 2xl:flex hw-btn text-[10px] items-center gap-1 px-2 py-1 rounded-md whitespace-nowrap tabular-nums cursor-pointer ${
              isVoiceLogOpen ? 'hw-btn-blue' : 'text-[#d9e8fa]'
            }`}
            title="Toggle Voice Command Log Sidebar"
          >
            <LabDrawerIcon name="slide-out" size={24} className="w-3 h-3 shrink-0" />
            <span>Log{voiceLogCount > 0 ? ` (${voiceLogCount})` : ''}</span>
          </button>
        )}
        {onSelectDiagnosticPanel && (
          <button
            type="button"
            onClick={() => onSelectDiagnosticPanel('WORKFLOW')}
            aria-pressed={activeTab === 'BENCH_LAB' && isWorkflowActive}
            className={`hw-btn text-[10px] flex items-center gap-1 px-2 py-1 rounded-md whitespace-nowrap tabular-nums cursor-pointer ${
              activeTab === 'BENCH_LAB' && isWorkflowActive ? 'hw-btn-blue' : 'text-[#d9e8fa]'
            }`}
            title="Open Pre-Bench Diagnostic Workflow Checklist"
          >
            <LabDrawerIcon name="tray-stack" size={24} className="w-3 h-3 shrink-0" />
            <span className="hidden xl:inline">
              Workflow ({workflowMandatoryChecked}/{workflowMandatoryTotal})
            </span>
            <span className="xl:hidden">
              Flow {workflowMandatoryChecked}/{workflowMandatoryTotal}
            </span>
          </button>
        )}
        {onSelectDiagnosticPanel && (
          <button
            type="button"
            data-testid="footer-logic-check-btn"
            onClick={() => onSelectDiagnosticPanel('LOGIC_CHECK')}
            aria-pressed={activeTab === 'BENCH_LAB' && isLogicCheckActive}
            className={`hw-btn text-[10px] flex items-center gap-1 px-2 py-1 rounded-md whitespace-nowrap tabular-nums cursor-pointer ${
              isLogicCheckCritical
                ? 'bg-rose-950/80 border-[#ff4d62]/70 text-rose-200'
                : logicCheckAlertCount > 0
                  ? 'hw-btn-amber'
                  : activeTab === 'BENCH_LAB' && isLogicCheckActive
                    ? 'hw-btn-green'
                    : 'text-[#d9e8fa]'
            }`}
            title="Open Automated Multi-Pin Logic Check Monitor"
          >
            <LabDrawerIcon
              name={isLogicCheckCritical ? 'status-fault' : 'active-drawer'}
              size={24}
              className="w-3 h-3 shrink-0"
            />
            <span>Logic{logicCheckAlertCount > 0 ? ` (${logicCheckAlertCount})` : ''}</span>
          </button>
        )}
        {activeTab === 'BENCH_LAB' && (
          <button
            type="button"
            onClick={() =>
              onSelectDiagnosticPanel ? onSelectDiagnosticPanel('MNA_GUIDE') : onToggleDiagnosticGuide()
            }
            aria-pressed={isMnaGuideActive}
            className={`hw-btn text-[10px] flex items-center gap-1 px-2 py-1 rounded-md whitespace-nowrap cursor-pointer ${
              isMnaGuideActive ? 'hw-btn-amber' : 'text-[#d9e8fa]'
            }`}
            title="Toggle 5-Step MNA Diagnostic Guide"
          >
            <span>5-Step</span>
          </button>
        )}
        <button
          type="button"
          onClick={onQuickAttachRedProbe}
          className="hw-btn text-[10px] text-rose-300 hover:text-white flex items-center gap-1 border-[#ff4d62]/45 px-2 py-1 rounded-md whitespace-nowrap cursor-pointer"
        >
          Red (+)
        </button>
        <button
          type="button"
          onClick={onQuickAttachBlackProbe}
          className="hw-btn text-[10px] text-[#d9e8fa] hover:text-white flex items-center gap-1 px-2 py-1 rounded-md whitespace-nowrap cursor-pointer"
        >
          COM (-)
        </button>
        {accessMode === 'TRIAL_ACTIVE' && isLowTimeWarning && (
          <button
            type="button"
            data-testid="footer-trial-lowtime-btn"
            onClick={() =>
              openAccessModal({
                tab: isAdminUnlocked ? 'ADMIN_GEN' : 'TRIAL_PIN',
                notice:
                  'Your trial PIN has less than 30 minutes remaining. Generate or enter a new 8-digit PIN to avoid interruption.',
              })
            }
            aria-label={`Trial PIN expiring in ${formatTrialCountdown(remainingSeconds)}. Click to generate or enter a new PIN.`}
            title="Trial PIN has under 30 minutes remaining — click to enter or issue a new PIN"
            className={`hw-btn text-[10px] flex items-center gap-1 px-2 py-1 rounded-md whitespace-nowrap tabular-nums cursor-pointer transition-colors ${
              isCriticalLowTime
                ? 'border-[#ff4d62]/65 bg-[#ff4d62]/15 text-[#ffd1d8] hover:bg-[#ff4d62]/25'
                : 'border-[#ffb020]/55 bg-[#ffb020]/10 text-[#ffb020] hover:bg-[#ffb020]/20'
            }`}
          >
            <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>{formattedFooterCountdown} · New PIN</span>
          </button>
        )}
        <ConnectionHealthWidget />
        <PerformanceMonitorWidget />
        <div
          aria-hidden="true"
          className="hidden xl:flex items-center gap-1 pl-1 opacity-85 shrink-0"
        >
          <span className="h-3 w-1 -skew-x-[30deg] rounded-[1px] bg-[#1677ff]" />
          <span className="h-3 w-1 -skew-x-[30deg] rounded-[1px] bg-[#19c8f5]" />
          <span className="h-3 w-1 -skew-x-[30deg] rounded-[1px] bg-[#1677ff]/75" />
        </div>
      </div>
    </footer>
  );
};
