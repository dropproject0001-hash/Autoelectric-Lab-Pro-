import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Delete,
  Download,
  History,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import {
  getDefaultWorkstationLabel,
  getOrCreateWorkstationDeviceId,
} from '../services/licenseClientService';
import {
  AccessModalTab,
  formatTrialCountdown,
  useTrialAccess,
} from '../context/TrialAccessContext';
import {
  AdminPinConfigStatus,
  ClientTrialPinRecord,
  fetchAdminPinConfigStatus,
  formatTrialDurationLabel,
  generateAdminTrialPinClient,
  importAdminTrialAuditCsv,
  loginAdminMasterPinClient,
  resetAdminTrialDeviceClient,
  revokeAdminTrialPinClient,
  setAdminPinToken,
  setupFirstRunAdminPinClient,
  TRIAL_DURATION_PRESETS,
  TrialAuditEventType,
  TrialDurationHours,
  TrialPinStatus,
} from '../services/trialPinClientService';
import {
  buildTrialAuditCsv,
  computeRemainingPercentForTrial,
  triggerAuditCsvDownload,
} from '../utils/auditCsvExport';

export interface AdminLicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: AccessModalTab;
}

const KEYPAD_KEYS: ReadonlyArray<{ label: string; value: string; aria: string }> = [
  { label: '1', value: '1', aria: 'Digit 1' },
  { label: '2', value: '2', aria: 'Digit 2' },
  { label: '3', value: '3', aria: 'Digit 3' },
  { label: '4', value: '4', aria: 'Digit 4' },
  { label: '5', value: '5', aria: 'Digit 5' },
  { label: '6', value: '6', aria: 'Digit 6' },
  { label: '7', value: '7', aria: 'Digit 7' },
  { label: '8', value: '8', aria: 'Digit 8' },
  { label: '9', value: '9', aria: 'Digit 9' },
  { label: 'CLR', value: 'CLEAR', aria: 'Clear all PIN digits' },
  { label: '0', value: '0', aria: 'Digit 0' },
  { label: 'DEL', value: 'BACKSPACE', aria: 'Delete last digit' },
];

function formatDate(ms: number | null): string {
  if (!ms) return 'Not activated';
  return new Date(ms).toLocaleString();
}

export const AdminLicenseModal: React.FC<AdminLicenseModalProps> = ({
  isOpen,
  onClose,
  initialTab,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const {
    accessMode,
    trialRecord,
    expiresAtMs,
    remainingSeconds,
    activeDeviceCount,
    activeTotalActivations,
    canUseAi,
    canUseExports,
    isAdminUnlocked,
    adminAuditTrials,
    adminAuditLog,
    adminAuditSummary,
    adminAuditServerSkewMs,
    adminAuditLoading,
    adminAuditError,
    refreshAdminAuditData,
    lockNotice,
    initialModalTab,
    clearLockNotice,
    redeemTrialPin,
    refreshAccessStatus,
    markAdminSessionActive,
    lockBenchSession,
  } = useTrialAccess();

  const [activeTab, setActiveTab] = useState<AccessModalTab>(initialTab ?? initialModalTab);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Technician 8-digit Trial PIN state
  const [pinDigits, setPinDigits] = useState('');
  const [deviceLabelInput, setDeviceLabelInput] = useState(() => getDefaultWorkstationLabel());

  // Master Admin Auth & 3-6h Generator + Audit Log State
  const [adminConfig, setAdminConfig] = useState<AdminPinConfigStatus | null>(null);
  const [masterPinInput, setMasterPinInput] = useState('');
  const [setupPinConfirm, setSetupPinConfirm] = useState('');
  const [trialDurationHours, setTrialDurationHours] = useState<TrialDurationHours>(4);
  const [unusedPickupHours, setUnusedPickupHours] = useState<number>(72);
  const [trialNotesInput, setTrialNotesInput] = useState('');
  const [newlyGeneratedTrialPin, setNewlyGeneratedTrialPin] = useState<string | null>(null);
  const [auditViewMode, setAuditViewMode] = useState<'REGISTRY' | 'AUDIT_STREAM'>('REGISTRY');
  const [registryStatusFilter, setRegistryStatusFilter] = useState<'ALL' | TrialPinStatus>('ALL');
  const [auditEventFilter, setAuditEventFilter] = useState<'ALL' | TrialAuditEventType>('ALL');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [expandedTrialIds, setExpandedTrialIds] = useState<Record<string, boolean>>({});
  const [adminNowTickMs, setAdminNowTickMs] = useState<number>(() => Date.now());
  const [importingAuditCsv, setImportingAuditCsv] = useState(false);
  const auditCsvFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const workstationDeviceId = getOrCreateWorkstationDeviceId();

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab ?? initialModalTab);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [initialModalTab, initialTab, isOpen]);

  const loadAdminTrialRegistry = useCallback(async () => {
    await refreshAdminAuditData();
  }, [refreshAdminAuditData]);

  const refreshAllAccessData = useCallback(
    async (_force = false) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const cfg = await fetchAdminPinConfigStatus();
        setAdminConfig(cfg);
        await refreshAccessStatus();

        if (isAdminUnlocked) {
          await loadAdminTrialRegistry();
        }
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to refresh access status.');
      } finally {
        setLoading(false);
      }
    },
    [isAdminUnlocked, loadAdminTrialRegistry, refreshAccessStatus]
  );

  useEffect(() => {
    if (!isOpen) return;
    void refreshAllAccessData(false);
  }, [isOpen, refreshAllAccessData]);

  // Keep admin trial countdown & audit snapshot fresh while open
  useEffect(() => {
    if (!isOpen || activeTab !== 'ADMIN_GEN' || !isAdminUnlocked) return;
    const pollId = window.setInterval(() => {
      void loadAdminTrialRegistry();
    }, 15_000);
    const tickId = window.setInterval(() => {
      setAdminNowTickMs(Date.now());
    }, 1_000);
    return () => {
      window.clearInterval(pollId);
      window.clearInterval(tickId);
    };
  }, [activeTab, isAdminUnlocked, isOpen, loadAdminTrialRegistry]);

  const filteredAdminTrials = useMemo(() => {
    const q = auditSearchQuery.trim().toLowerCase();
    return adminAuditTrials.filter((tr) => {
      if (registryStatusFilter !== 'ALL' && tr.status !== registryStatusFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        tr.maskedPin,
        tr.trialId,
        tr.notes,
        tr.boundDeviceLabel || '',
        ...tr.usageHistory.map((u) => `${u.deviceLabel} ${u.maskedDeviceId}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [adminAuditTrials, auditSearchQuery, registryStatusFilter]);

  const filteredAuditLog = useMemo(() => {
    const q = auditSearchQuery.trim().toLowerCase();
    return adminAuditLog.filter((evt) => {
      if (auditEventFilter !== 'ALL' && evt.eventType !== auditEventFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        evt.maskedPin,
        evt.trialId,
        evt.actor,
        evt.deviceLabel || '',
        evt.maskedDeviceId || '',
        evt.detail,
        evt.eventType,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [adminAuditLog, auditEventFilter, auditSearchQuery]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleKeypadPress = (value: string) => {
    setErrorMsg(null);
    if (value === 'CLEAR') {
      setPinDigits('');
      return;
    }
    if (value === 'BACKSPACE') {
      setPinDigits((prev) => prev.slice(0, -1));
      return;
    }
    if (/^\d$/.test(value)) {
      setPinDigits((prev) => (prev.length >= 8 ? prev : prev + value));
    }
  };

  const handleRawPinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 8);
    setPinDigits(cleaned);
    setErrorMsg(null);
  };

  const handleRedeemTrialPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinDigits.length !== 8) {
      setErrorMsg('Enter all 8 numeric digits (XXXX-XXXX).');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await redeemTrialPin(pinDigits, deviceLabelInput);
      clearLockNotice();
      setPinDigits('');
      setSuccessMsg(
        res.newlyActivated
          ? `Trial PIN activated for ${formatTrialDurationLabel(res.trial.durationHours, 'full')} (bound strictly to this single workstation). All Pro AI tools & exports are unlocked.`
          : `Workstation re-verified on active ${formatTrialDurationLabel(res.trial.durationHours, 'full')} trial session.`
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to activate Trial PIN.');
    } finally {
      setLoading(false);
    }
  };

  const handleFirstRunAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const cleaned = masterPinInput.replace(/\D/g, '');
    const confirmed = setupPinConfirm.replace(/\D/g, '');
    if (cleaned.length < 6 || cleaned.length > 12) {
      setErrorMsg('Master Admin PIN must be 6 to 12 numeric digits.');
      return;
    }
    if (cleaned !== confirmed) {
      setErrorMsg('Master Admin PIN confirmation does not match.');
      return;
    }
    setLoading(true);
    try {
      await setupFirstRunAdminPinClient(cleaned);
      setMasterPinInput('');
      setSetupPinConfirm('');
      markAdminSessionActive(true);
      setAdminConfig({ masterEnvConfigured: false, adminClaimed: true });
      await loadAdminTrialRegistry();
      setSuccessMsg('Master Admin PIN initialized and console unlocked.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Admin setup failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!masterPinInput.trim()) {
      setErrorMsg('Enter the Master Admin PIN.');
      return;
    }
    setLoading(true);
    try {
      await loginAdminMasterPinClient(masterPinInput.trim());
      setMasterPinInput('');
      markAdminSessionActive(true);
      await loadAdminTrialRegistry();
      setSuccessMsg('Administrator Trial PIN Console unlocked.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Incorrect Master Admin PIN.');
    } finally {
      setLoading(false);
    }
  };

  const handleLockAdminConsole = () => {
    setAdminPinToken(null);
    markAdminSessionActive(false);
    setNewlyGeneratedTrialPin(null);
    setExpandedTrialIds({});
    setSuccessMsg('Administrator console locked.');
  };

  const handleGenerateTrialPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setNewlyGeneratedTrialPin(null);
    setLoading(true);
    try {
      const created = await generateAdminTrialPinClient({
        durationHours: trialDurationHours,
        unusedExpiryHours: unusedPickupHours,
        notes: trialNotesInput,
      });
      setNewlyGeneratedTrialPin(created.formattedPin);
      setTrialNotesInput('');
      setSuccessMsg(
        `Generated 8-digit PIN for ${formatTrialDurationLabel(created.trial.durationHours, 'full')} single-device Pro access. Countdown begins on first technician login.`
      );
      await loadAdminTrialRegistry();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate Trial PIN.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTrialRevoke = async (rec: ClientTrialPinRecord) => {
    const nextRevoked = rec.status !== 'REVOKED';
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await revokeAdminTrialPinClient(
        rec.trialId,
        nextRevoked,
        nextRevoked ? 'Revoked via Admin Trial Console' : undefined
      );
      await loadAdminTrialRegistry();
      await refreshAccessStatus();
      setSuccessMsg(nextRevoked ? 'Trial PIN revoked immediately.' : 'Trial PIN restored.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update Trial PIN status.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetTrialDevice = async (trialId: string) => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await resetAdminTrialDeviceClient(trialId);
      await loadAdminTrialRegistry();
      setSuccessMsg('Single-device workstation binding cleared (0/1). Ready for re-binding.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reset device binding.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportAuditCsv = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (adminAuditTrials.length === 0 && adminAuditLog.length === 0) {
      setErrorMsg('No audit log events or trial PIN records available to export yet.');
      return;
    }
    try {
      const nowMs = Date.now();
      const csv = buildTrialAuditCsv({
        trials: adminAuditTrials,
        auditLog: adminAuditLog,
        exportedAtMs: nowMs,
      });
      const filename = triggerAuditCsvDownload(csv, nowMs);
      setSuccessMsg(
        `Exported sanitized ${filename} (${adminAuditLog.length} audit events, ${adminAuditTrials.length} PIN records — user IDs, emails & device IDs scrubbed).`
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to export audit logs CSV.');
    }
  };

  const handleImportAuditCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    if (file.size === 0) {
      setErrorMsg('Selected CSV file is empty.');
      return;
    }
    if (file.size > 1_000_000) {
      setErrorMsg('Selected CSV file exceeds the 1 MB maximum import limit.');
      return;
    }

    setImportingAuditCsv(true);
    try {
      const csvText = await file.text();
      const result = await importAdminTrialAuditCsv(csvText, file.name);
      await loadAdminTrialRegistry();
      setSuccessMsg(
        `Imported ${result.importedEvents} audit event(s) and ${result.importedTrials} historical PIN record(s)` +
          (result.skippedDuplicateEvents > 0 || result.skippedExistingTrials > 0
            ? ` (skipped ${result.skippedDuplicateEvents} duplicate event(s), ${result.skippedExistingTrials} existing PIN(s))`
            : '') +
          '.'
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to import audit logs CSV.');
    } finally {
      setImportingAuditCsv(false);
    }
  };

  const handleCopyText = async (text: string, label: string) => {
    if (!navigator.clipboard) {
      setErrorMsg('Clipboard unavailable in this browser context.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setSuccessMsg(`Copied ${label} to clipboard.`);
    } catch {
      setErrorMsg(`Unable to copy ${label}.`);
    }
  };

  const hasAdminRights = isAdminUnlocked;
  const isExpiringSoon =
    accessMode === 'TRIAL_ACTIVE' && remainingSeconds !== null && remainingSeconds < 900;

  const formattedDisplaySlots = Array.from({ length: 8 }, (_, idx) => pinDigits[idx] ?? '•');

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Trial PIN Access and Admin Generator Console"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.985, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: 'easeOut' }}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-[#203653] bg-[#060B14] text-[#EAF3FF] shadow-[0_24px_64px_rgba(2,6,14,0.92)]"
      >
        {/* Calibrated Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#203653] bg-[#0A1220] px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#19C8F5]/40 bg-[#0E192A] text-[#19C8F5]">
              <KeyRound className="h-4.5 w-4.5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-hud text-sm sm:text-base font-bold uppercase tracking-[0.08em] text-[#EAF3FF] truncate">
                Trial PIN &amp; Pro Access Console
              </h2>
              <p className="font-mono text-[10.5px] text-[#91A4BD] truncate">
                8-Digit Numeric PIN · Single Workstation Binding · 3h–1y Pro Access
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={lockBenchSession}
              className="hw-btn inline-flex h-9 items-center gap-1.5 rounded-md border border-[#203653] bg-[#0E192A] px-2.5 font-mono text-[11px] font-semibold uppercase text-[#FFB020] hover:border-[#FFB020]/70 cursor-pointer"
              title="Lock Bench Lab and return to PIN Verification Landing Page"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden xs:inline">Lock Lab</span>
            </button>
            <button
              type="button"
              onClick={() => void refreshAllAccessData(true)}
              disabled={loading}
              className="hw-btn inline-flex h-9 items-center gap-1.5 rounded-md border border-[#203653] bg-[#0E192A] px-2.5 font-mono text-[11px] font-semibold uppercase text-[#EAF3FF] hover:border-[#19C8F5]/70 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-[#19C8F5] ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden xs:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Trial PIN console"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#203653] bg-[#0E192A] text-[#91A4BD] hover:border-[#19C8F5]/70 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs (PIN-Only: Technician PIN & Admin Generator) */}
        <div
          role="tablist"
          aria-label="Access console modes"
          className="grid grid-cols-2 border-b border-[#203653] bg-[#09101C] px-3 pt-2 gap-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'TRIAL_PIN'}
            onClick={() => {
              setActiveTab('TRIAL_PIN');
              setErrorMsg(null);
            }}
            className={`min-h-[40px] rounded-t-md border-x border-t px-2.5 py-1.5 font-hud text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
              activeTab === 'TRIAL_PIN'
                ? 'border-[#203653] bg-[#0E192A] text-[#19C8F5] border-b-2 border-b-[#19C8F5]'
                : 'border-transparent text-[#91A4BD] hover:text-[#EAF3FF]'
            }`}
          >
            Technician PIN
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ADMIN_GEN'}
            onClick={() => {
              setActiveTab('ADMIN_GEN');
              setErrorMsg(null);
            }}
            className={`min-h-[40px] rounded-t-md border-x border-t px-2.5 py-1.5 font-hud text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'ADMIN_GEN'
                ? 'border-[#203653] bg-[#0E192A] text-[#FFB020] border-b-2 border-b-[#FFB020]'
                : 'border-transparent text-[#91A4BD] hover:text-[#EAF3FF]'
            }`}
          >
            {hasAdminRights ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            <span>Admin Generator</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
          {/* Live Telemetry Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-md border border-[#203653] bg-[#0E192A] p-3 font-mono text-xs tabular-nums">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#91A4BD]">
                Access Status
              </div>
              <div className="mt-1 font-bold flex items-center gap-1.5">
                {accessMode === 'ADMIN' ? (
                  <span className="text-[#FFB020]">● ADMIN PRO UNLOCKED</span>
                ) : accessMode === 'TRIAL_ACTIVE' ? (
                  <span className={isExpiringSoon ? 'text-[#FFB020]' : 'text-[#20D889]'}>
                    {isExpiringSoon ? '▲ TRIAL EXPIRING SOON' : '● PRO TRIAL ACTIVE'}
                  </span>
                ) : accessMode === 'TRIAL_EXPIRED' ? (
                  <span className="text-[#FF4D62]">✖ TRIAL EXPIRED (LOCKED)</span>
                ) : accessMode === 'TRIAL_REVOKED' ? (
                  <span className="text-[#FF4D62]">✖ TRIAL REVOKED (LOCKED)</span>
                ) : (
                  <span className="text-[#91A4BD]">○ PIN VERIFICATION REQUIRED</span>
                )}
              </div>
              <div className="mt-0.5 text-[10.5px] text-[#91A4BD]">
                AI Tools: <strong className={canUseAi ? 'text-[#20D889]' : 'text-[#FF4D62]'}>{canUseAi ? 'UNLOCKED' : 'LOCKED'}</strong>
                {' · '}
                Exports: <strong className={canUseExports ? 'text-[#20D889]' : 'text-[#FF4D62]'}>{canUseExports ? 'UNLOCKED' : 'LOCKED'}</strong>
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#91A4BD]">
                Trial Countdown
              </div>
              <div
                className={`mt-1 text-lg font-bold tracking-wider ${
                  accessMode === 'TRIAL_ACTIVE'
                    ? isExpiringSoon
                      ? 'text-[#FFB020]'
                      : 'text-[#19C8F5]'
                    : accessMode === 'TRIAL_EXPIRED' || accessMode === 'TRIAL_REVOKED'
                      ? 'text-[#FF4D62]'
                      : 'text-[#91A4BD]'
                }`}
              >
                {accessMode === 'TRIAL_ACTIVE'
                  ? formatTrialCountdown(remainingSeconds)
                  : accessMode === 'TRIAL_EXPIRED' || accessMode === 'TRIAL_REVOKED'
                    ? '00:00:00'
                    : trialRecord
                      ? `${formatTrialDurationLabel(trialRecord.durationHours, 'short').toUpperCase()} ACCESS`
                      : '--:--:--'}
              </div>
              <div className="text-[10px] text-[#91A4BD] truncate">
                {expiresAtMs
                  ? `Expires: ${new Date(expiresAtMs).toLocaleTimeString()}`
                  : trialRecord?.maskedPin
                    ? `PIN: ${trialRecord.maskedPin}`
                    : 'Timer starts on first workstation login'}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#91A4BD]">
                Single-Device Binding (1/1)
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[#EAF3FF]">
                <Laptop className="h-3.5 w-3.5 shrink-0 text-[#19C8F5]" aria-hidden="true" />
                <span className="truncate font-semibold">{workstationDeviceId}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-[#91A4BD] truncate">
                {trialRecord
                  ? `${trialRecord.boundDeviceLabel || 'Workstation'} · ${activeDeviceCount} device${activeDeviceCount === 1 ? '' : 's'} · ${activeTotalActivations} login${activeTotalActivations === 1 ? '' : 's'}`
                  : 'Unbound workstation'}
              </div>
            </div>
          </div>

          {/* Alerts / Lock Notice */}
          {lockNotice && !successMsg && (
            <div className="flex items-start justify-between gap-2 rounded-md border border-[#FF4D62]/60 bg-[#FF4D62]/10 px-3 py-2.5 font-mono text-xs text-[#FFD1D8]">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#FF4D62]" aria-hidden="true" />
                <span>{lockNotice}</span>
              </div>
              <button
                type="button"
                onClick={clearLockNotice}
                aria-label="Dismiss lock notice"
                className="text-[#FFD1D8]/70 hover:text-white cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-md border border-[#FF4D62]/60 bg-[#FF4D62]/10 px-3 py-2.5 font-mono text-xs text-[#FFD1D8]">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#FF4D62]" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2 rounded-md border border-[#20D889]/60 bg-[#20D889]/10 px-3 py-2.5 font-mono text-xs text-[#B7FCE0]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#20D889]" aria-hidden="true" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: TECHNICIAN 8-DIGIT TRIAL PIN LOGIN */}
          {activeTab === 'TRIAL_PIN' && (
            <form
              onSubmit={handleRedeemTrialPin}
              className="grid grid-cols-1 lg:grid-cols-12 gap-4"
            >
              <div className="lg:col-span-7 space-y-3.5 rounded-md border border-[#203653] bg-[#0E192A] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-hud text-xs font-bold uppercase tracking-[0.1em] text-[#19C8F5]">
                    Enter 8-Digit Trial PIN
                  </span>
                  <span className="font-mono text-[10px] text-[#91A4BD]">
                    Format: XXXX-XXXX · 1 Device Limit
                  </span>
                </div>

                {/* Segmented Digit Display + Direct Keyboard Input */}
                <div className="space-y-2">
                  <div
                    className="flex items-center justify-center gap-1.5 sm:gap-2 rounded-md border border-[#203653] bg-[#060B14] px-3 py-3"
                    aria-label="8-digit PIN display"
                  >
                    {formattedDisplaySlots.slice(0, 4).map((digit, i) => (
                      <span
                        key={`s1-${i}`}
                        className={`flex h-11 w-9 sm:w-10 items-center justify-center rounded border font-mono text-xl font-bold tabular-nums transition-colors ${
                          digit !== '•'
                            ? 'border-[#19C8F5] bg-[#19C8F5]/12 text-white'
                            : 'border-[#203653] bg-[#0A1220] text-[#91A4BD]/45'
                        }`}
                      >
                        {digit}
                      </span>
                    ))}
                    <span className="px-0.5 font-mono text-lg font-bold text-[#91A4BD]">-</span>
                    {formattedDisplaySlots.slice(4, 8).map((digit, i) => (
                      <span
                        key={`s2-${i}`}
                        className={`flex h-11 w-9 sm:w-10 items-center justify-center rounded border font-mono text-xl font-bold tabular-nums transition-colors ${
                          digit !== '•'
                            ? 'border-[#19C8F5] bg-[#19C8F5]/12 text-white'
                            : 'border-[#203653] bg-[#0A1220] text-[#91A4BD]/45'
                        }`}
                      >
                        {digit}
                      </span>
                    ))}
                  </div>

                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={pinDigits}
                    onChange={handleRawPinInputChange}
                    placeholder="Type or paste 8-digit PIN (e.g. 48291034)"
                    aria-label="8-digit numeric trial PIN input"
                    className="w-full rounded-md border border-[#203653] bg-[#060B14] px-3 py-2 font-mono text-xs tracking-[0.18em] text-[#EAF3FF] placeholder:tracking-normal placeholder:text-[#91A4BD]/60 focus:border-[#19C8F5] focus:outline-none"
                  />
                </div>

                {/* Workstation Label */}
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[#91A4BD]">
                    Workstation Label (Single-Device Lock)
                  </label>
                  <input
                    type="text"
                    value={deviceLabelInput}
                    onChange={(e) => setDeviceLabelInput(e.target.value)}
                    placeholder="Shop Bench Terminal #1"
                    className="w-full rounded-md border border-[#203653] bg-[#060B14] px-3 py-2 font-mono text-xs text-[#EAF3FF] focus:border-[#19C8F5] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || pinDigits.length !== 8}
                  className="hw-btn inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-[#19C8F5]/75 bg-[#19C8F5]/18 px-4 py-2.5 font-hud text-xs font-bold uppercase tracking-[0.12em] text-[#EAF3FF] hover:bg-[#19C8F5]/28 disabled:opacity-45 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4 text-[#19C8F5]" aria-hidden="true" />
                  <span>{loading ? 'Verifying PIN...' : 'Unlock Full Pro Trial'}</span>
                </button>
              </div>

              {/* Right Column: Touch Keypad + Scope Guidance */}
              <div className="lg:col-span-5 flex flex-col justify-between gap-3 rounded-md border border-[#203653] bg-[#0E192A] p-4">
                <div>
                  <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-[#91A4BD]">
                    <span>Numeric PIN Keypad</span>
                    <span>{pinDigits.length}/8 Digits</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {KEYPAD_KEYS.map((keyItem) => {
                      const isAction = keyItem.value === 'CLEAR' || keyItem.value === 'BACKSPACE';
                      return (
                        <button
                          key={keyItem.value}
                          type="button"
                          aria-label={keyItem.aria}
                          onClick={() => handleKeypadPress(keyItem.value)}
                          className={`min-h-[46px] rounded-md border font-mono text-sm font-bold transition active:scale-95 cursor-pointer flex items-center justify-center ${
                            isAction
                              ? 'border-[#203653] bg-[#09101C] text-[#91A4BD] hover:border-[#FFB020]/60 hover:text-[#FFB020]'
                              : 'border-[#203653] bg-[#060B14] text-[#EAF3FF] hover:border-[#19C8F5]/75 hover:bg-[#132238]'
                          }`}
                        >
                          {keyItem.value === 'BACKSPACE' ? (
                            <Delete className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            keyItem.label
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-md border border-[#203653] bg-[#060B14] p-3 font-mono text-[11px] space-y-1 text-[#91A4BD]">
                  <div className="font-bold uppercase text-[#EAF3FF]">Trial Access Policy</div>
                  <p>• Grants Full Pro AI Vision, Grounded OEM Search, Chat &amp; all Exports for 3h–6h or 30d–1y.</p>
                  <p>• Countdown starts on first login and locks strictly to this 1 workstation.</p>
                  <p>• On expiry, AI &amp; exports lock immediately while bench wiring stays safe.</p>
                </div>
              </div>
            </form>
          )}

          {/* TAB 2: MASTER ADMIN PIN GATE & 3-6 HOUR TRIAL GENERATOR */}
          {activeTab === 'ADMIN_GEN' && (
            <div className="space-y-4">
              {!hasAdminRights ? (
                adminConfig && !adminConfig.masterEnvConfigured && !adminConfig.adminClaimed ? (
                  <form
                    onSubmit={handleFirstRunAdminSetup}
                    className="mx-auto max-w-lg space-y-3 rounded-md border border-[#FFB020]/50 bg-[#0E192A] p-4"
                  >
                    <div className="flex items-center gap-2 text-[#FFB020]">
                      <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                      <h3 className="font-hud text-sm font-bold uppercase tracking-wider">
                        First-Run Master Admin PIN Setup
                      </h3>
                    </div>
                    <p className="font-mono text-xs text-[#91A4BD]">
                      No <code className="text-[#EAF3FF]">VECL_ADMIN_MASTER_PIN</code> environment secret
                      is set yet. Create a 6–12 digit Master Admin PIN now to lock administrator access.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="mb-1 block font-mono text-[10px] uppercase text-[#91A4BD]">
                          New Master PIN (6–12 Digits)
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          value={masterPinInput}
                          onChange={(e) => setMasterPinInput(e.target.value.replace(/\D/g, '').slice(0, 12))}
                          placeholder="e.g. 904812"
                          required
                          className="w-full rounded-md border border-[#203653] bg-[#060B14] px-3 py-2 font-mono text-xs text-white focus:border-[#FFB020] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block font-mono text-[10px] uppercase text-[#91A4BD]">
                          Confirm Master PIN
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          value={setupPinConfirm}
                          onChange={(e) => setSetupPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 12))}
                          placeholder="Re-enter PIN"
                          required
                          className="w-full rounded-md border border-[#203653] bg-[#060B14] px-3 py-2 font-mono text-xs text-white focus:border-[#FFB020] focus:outline-none"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="hw-btn inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-[#FFB020]/70 bg-[#FFB020]/18 px-4 py-2 font-hud text-xs font-bold uppercase tracking-wider text-[#FFB020] hover:bg-[#FFB020]/28 cursor-pointer"
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      <span>Save Master Admin PIN &amp; Unlock Console</span>
                    </button>
                  </form>
                ) : (
                  <form
                    onSubmit={handleAdminMasterLogin}
                    className="mx-auto max-w-md space-y-3 rounded-md border border-[#203653] bg-[#0E192A] p-4"
                  >
                    <div className="flex items-center gap-2 text-[#FFB020]">
                      <Lock className="h-4.5 w-4.5" aria-hidden="true" />
                      <h3 className="font-hud text-sm font-bold uppercase tracking-wider">
                        Master Admin PIN Required
                      </h3>
                    </div>
                    <p className="font-mono text-xs text-[#91A4BD]">
                      Enter the server Master Admin PIN to issue 3h–1y trial PINs, reset device locks, or revoke active trials.
                    </p>
                    <div>
                      <label className="mb-1 block font-mono text-[10px] uppercase text-[#91A4BD]">
                        Master Admin PIN
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        value={masterPinInput}
                        onChange={(e) => setMasterPinInput(e.target.value)}
                        placeholder="Enter Master Admin PIN"
                        required
                        className="w-full rounded-md border border-[#203653] bg-[#060B14] px-3 py-2.5 font-mono text-sm tracking-widest text-white focus:border-[#FFB020] focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading || !masterPinInput.trim()}
                      className="hw-btn inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-[#FFB020]/70 bg-[#FFB020]/18 px-4 py-2 font-hud text-xs font-bold uppercase tracking-wider text-[#FFB020] hover:bg-[#FFB020]/28 disabled:opacity-45 cursor-pointer"
                    >
                      <Unlock className="h-4 w-4" aria-hidden="true" />
                      <span>{loading ? 'Verifying...' : 'Unlock Trial PIN Generator'}</span>
                    </button>
                  </form>
                )
              ) : (
                <div className="space-y-4">
                  {/* Generator Panel */}
                  <form
                    onSubmit={handleGenerateTrialPin}
                    className="space-y-3 rounded-md border border-[#FFB020]/45 bg-[#0E192A] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#203653] pb-2.5">
                      <div>
                        <h3 className="font-hud text-xs font-bold uppercase tracking-[0.1em] text-[#FFB020]">
                          Generate 8-Digit Pro PIN (3h–6h &amp; 30d–1y · Single Device)
                        </h3>
                        <p className="font-mono text-[10.5px] text-[#91A4BD]">
                          Countdown begins when the technician logs in. Plaintext PIN is revealed once.
                        </p>
                      </div>
                      {isAdminUnlocked && (
                        <button
                          type="button"
                          onClick={handleLockAdminConsole}
                          className="inline-flex items-center gap-1 rounded border border-[#203653] bg-[#060B14] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase text-[#91A4BD] hover:border-[#FF4D62]/60 hover:text-[#FF4D62] cursor-pointer whitespace-nowrap"
                        >
                          <LogOut className="h-3 w-3" aria-hidden="true" />
                          <span>Lock Admin</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-5">
                        <label className="mb-1.5 block font-mono text-[10px] uppercase text-[#91A4BD]">
                          Duration Selection (Hours &amp; Long-Term)
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {TRIAL_DURATION_PRESETS.map((preset) => {
                            const selected = trialDurationHours === preset.hours;
                            return (
                              <button
                                key={preset.hours}
                                type="button"
                                aria-pressed={selected}
                                title={preset.fullLabel}
                                onClick={() => setTrialDurationHours(preset.hours)}
                                className={`min-h-[36px] rounded border px-1.5 font-mono text-[11px] font-bold tabular-nums transition cursor-pointer whitespace-nowrap ${
                                  selected
                                    ? 'border-[#19C8F5] bg-[#19C8F5]/20 text-white'
                                    : preset.group === 'EXTENDED'
                                      ? 'border-[#203653] bg-[#091220] text-[#D9E8FA] hover:border-[#19C8F5]/60'
                                      : 'border-[#203653] bg-[#060B14] text-[#91A4BD] hover:border-[#19C8F5]/50'
                                }`}
                              >
                                {preset.shortLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="mb-1.5 block font-mono text-[10px] uppercase text-[#91A4BD]">
                          Pickup Window
                        </label>
                        <select
                          value={unusedPickupHours}
                          onChange={(e) => setUnusedPickupHours(Number(e.target.value))}
                          className="w-full min-h-[38px] rounded border border-[#203653] bg-[#060B14] px-2.5 font-mono text-xs text-[#EAF3FF]"
                        >
                          <option value={24}>24 Hours</option>
                          <option value={72}>72 Hours</option>
                          <option value={168}>7 Days</option>
                          <option value={720}>30 Days</option>
                        </select>
                      </div>

                      <div className="md:col-span-3">
                        <label className="mb-1.5 block font-mono text-[10px] uppercase text-[#91A4BD]">
                          Technician / Shop Note
                        </label>
                        <input
                          type="text"
                          value={trialNotesInput}
                          onChange={(e) => setTrialNotesInput(e.target.value)}
                          placeholder="e.g. Bay 2 Eval"
                          className="w-full min-h-[38px] rounded border border-[#203653] bg-[#060B14] px-2.5 font-mono text-xs text-white focus:border-[#19C8F5] focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <button
                          type="submit"
                          disabled={loading}
                          className="hw-btn inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded border border-[#FFB020]/75 bg-[#FFB020]/20 px-2.5 font-hud text-xs font-bold uppercase tracking-wider text-[#FFB020] hover:bg-[#FFB020]/30 cursor-pointer whitespace-nowrap"
                        >
                          <PlusCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>Issue PIN</span>
                        </button>
                      </div>
                    </div>

                    {newlyGeneratedTrialPin && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#19C8F5] bg-[#19C8F5]/12 p-3">
                        <div>
                          <div className="font-mono text-[10px] font-bold uppercase text-[#19C8F5]">
                            One-Time Plaintext 8-Digit Trial PIN (Copy Now)
                          </div>
                          <div className="mt-0.5 font-mono text-2xl font-bold tracking-[0.22em] text-white tabular-nums">
                            {newlyGeneratedTrialPin}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopyText(newlyGeneratedTrialPin, 'Trial PIN')}
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded border border-[#19C8F5] bg-[#060B14] px-3 py-1.5 font-mono text-xs font-bold text-[#19C8F5] hover:bg-[#19C8F5]/15 cursor-pointer"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Copy PIN</span>
                        </button>
                      </div>
                    )}
                  </form>

                  {/* Secure Admin Audit Log & Usage Telemetry Dashboard */}
                  <div className="space-y-3 rounded-md border border-[#203653] bg-[#0A1220] p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#203653] pb-2.5">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-[#19C8F5]" aria-hidden="true" />
                        <div>
                          <h3 className="font-hud text-xs font-bold uppercase tracking-[0.1em] text-[#EAF3FF]">
                            Secure Admin Audit Log &amp; Usage History
                          </h3>
                          <p className="font-mono text-[10px] text-[#91A4BD]">
                            Masked PINs only · Color status badges, remaining progress bars, immediate revocation &amp; CSV audit export
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={auditCsvFileInputRef}
                          type="file"
                          accept=".csv,text/csv"
                          data-testid="admin-import-logs-input"
                          onChange={(e) => void handleImportAuditCsvFile(e)}
                          className="sr-only"
                          aria-label="Upload CSV audit log file"
                        />
                        <button
                          type="button"
                          data-testid="admin-import-logs-btn"
                          onClick={() => auditCsvFileInputRef.current?.click()}
                          disabled={importingAuditCsv || adminAuditLoading}
                          className="inline-flex items-center gap-1.5 rounded border border-[#FFB020]/55 bg-[#FFB020]/12 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-[#FFB020] hover:bg-[#FFB020]/22 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                        >
                          <Upload
                            className={`h-3 w-3 ${importingAuditCsv ? 'animate-pulse' : ''}`}
                            aria-hidden="true"
                          />
                          <span>{importingAuditCsv ? 'Importing...' : 'Import Logs'}</span>
                        </button>
                        <button
                          type="button"
                          data-testid="admin-export-logs-btn"
                          onClick={handleExportAuditCsv}
                          disabled={adminAuditTrials.length === 0 && adminAuditLog.length === 0}
                          title="Download sanitized CSV audit log (user IDs, emails, and device IDs scrubbed; PIN usage stats preserved)"
                          className="inline-flex items-center gap-1.5 rounded border border-[#20D889]/55 bg-[#20D889]/12 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-[#20D889] hover:bg-[#20D889]/22 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                        >
                          <Download className="h-3 w-3" aria-hidden="true" />
                          <span>Export Logs</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void loadAdminTrialRegistry()}
                          disabled={adminAuditLoading}
                          className="inline-flex items-center gap-1.5 rounded border border-[#203653] bg-[#060B14] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase text-[#19C8F5] hover:border-[#19C8F5]/70 cursor-pointer whitespace-nowrap"
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${adminAuditLoading ? 'animate-spin' : ''}`}
                            aria-hidden="true"
                          />
                          <span>Sync Audit</span>
                        </button>
                      </div>
                    </div>

                    {/* Audit KPI Telemetry Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono tabular-nums">
                      <div className="rounded border border-[#203653] bg-[#060B14] px-2.5 py-2">
                        <div className="text-[9.5px] uppercase tracking-wider text-[#91A4BD]">
                          Issued PINs
                        </div>
                        <div className="mt-0.5 text-base font-bold text-[#EAF3FF]">
                          {adminAuditSummary?.totalPins ?? adminAuditTrials.length}
                        </div>
                        <div className="text-[9.5px] text-[#91A4BD]">
                          {adminAuditSummary?.unusedPins ?? 0} unused pickup
                        </div>
                      </div>
                      <div className="rounded border border-[#203653] bg-[#060B14] px-2.5 py-2">
                        <div className="text-[9.5px] uppercase tracking-wider text-[#91A4BD]">
                          Active Trials
                        </div>
                        <div className="mt-0.5 text-base font-bold text-[#20D889]">
                          {adminAuditSummary?.activePins ?? 0}
                        </div>
                        <div
                          className={`text-[9.5px] ${
                            (adminAuditSummary?.expiringSoonPins ?? 0) > 0
                              ? 'text-[#FFB020]'
                              : 'text-[#91A4BD]'
                          }`}
                        >
                          {adminAuditSummary?.expiringSoonPins ?? 0} expiring &lt;30m
                        </div>
                      </div>
                      <div className="rounded border border-[#203653] bg-[#060B14] px-2.5 py-2">
                        <div className="text-[9.5px] uppercase tracking-wider text-[#91A4BD]">
                          Total Devices Used
                        </div>
                        <div className="mt-0.5 text-base font-bold text-[#19C8F5]">
                          {adminAuditSummary?.totalUniqueDevicesUsed ?? 0}
                        </div>
                        <div className="text-[9.5px] text-[#91A4BD]">
                          {adminAuditSummary?.totalActivations ?? 0} total logins
                        </div>
                      </div>
                      <div className="rounded border border-[#203653] bg-[#060B14] px-2.5 py-2">
                        <div className="text-[9.5px] uppercase tracking-wider text-[#91A4BD]">
                          Expired / Revoked
                        </div>
                        <div className="mt-0.5 text-base font-bold text-[#FF4D62]">
                          {(adminAuditSummary?.expiredPins ?? 0) +
                            (adminAuditSummary?.revokedPins ?? 0)}
                        </div>
                        <div className="text-[9.5px] text-[#91A4BD]">
                          {adminAuditSummary?.revokedPins ?? 0} manually revoked
                        </div>
                      </div>
                    </div>

                    {adminAuditError && (
                      <div className="flex items-center justify-between gap-2 rounded border border-[#FF4D62]/60 bg-[#FF4D62]/10 px-3 py-2 font-mono text-[11px] text-[#FFD1D8]">
                        <span>{adminAuditError}</span>
                        <button
                          type="button"
                          onClick={() => void loadAdminTrialRegistry()}
                          className="rounded border border-[#FF4D62]/70 px-2 py-0.5 text-[10px] font-bold uppercase hover:bg-[#FF4D62]/20 cursor-pointer whitespace-nowrap"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {/* View Toggle + Filters + Search */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1 rounded border border-[#203653] bg-[#060B14] p-0.5 font-mono text-[10.5px]">
                        <button
                          type="button"
                          onClick={() => setAuditViewMode('REGISTRY')}
                          className={`rounded px-2.5 py-1 font-bold uppercase transition cursor-pointer whitespace-nowrap ${
                            auditViewMode === 'REGISTRY'
                              ? 'bg-[#132238] text-[#19C8F5]'
                              : 'text-[#91A4BD] hover:text-[#EAF3FF]'
                          }`}
                        >
                          Recent PINs &amp; Usage ({adminAuditTrials.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuditViewMode('AUDIT_STREAM')}
                          className={`rounded px-2.5 py-1 font-bold uppercase transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                            auditViewMode === 'AUDIT_STREAM'
                              ? 'bg-[#132238] text-[#FFB020]'
                              : 'text-[#91A4BD] hover:text-[#EAF3FF]'
                          }`}
                        >
                          <History className="h-3 w-3" aria-hidden="true" />
                          <span>Security Audit Log ({adminAuditLog.length})</span>
                        </button>
                      </div>

                      <div className="relative flex-1 min-w-[190px] max-w-xs">
                        <Search
                          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#91A4BD]"
                          aria-hidden="true"
                        />
                        <input
                          type="text"
                          value={auditSearchQuery}
                          onChange={(e) => setAuditSearchQuery(e.target.value)}
                          placeholder="Filter masked PIN, device, note..."
                          aria-label="Filter trial audit records"
                          className="w-full rounded border border-[#203653] bg-[#060B14] py-1.5 pl-8 pr-2.5 font-mono text-[11px] text-[#EAF3FF] placeholder:text-[#91A4BD]/60 focus:border-[#19C8F5] focus:outline-none"
                        />
                      </div>
                    </div>

                    {auditViewMode === 'REGISTRY' ? (
                      <>
                        <div className="flex flex-wrap items-center gap-1 font-mono text-[10px]">
                          {(['ALL', 'ACTIVE', 'UNUSED', 'EXPIRED', 'REVOKED'] as const).map(
                            (statusOpt) => {
                              const selected = registryStatusFilter === statusOpt;
                              return (
                                <button
                                  key={statusOpt}
                                  type="button"
                                  onClick={() => setRegistryStatusFilter(statusOpt)}
                                  className={`rounded border px-2 py-0.5 font-bold uppercase cursor-pointer whitespace-nowrap ${
                                    selected
                                      ? 'border-[#19C8F5] bg-[#19C8F5]/15 text-[#19C8F5]'
                                      : 'border-[#203653] bg-[#060B14] text-[#91A4BD] hover:text-[#EAF3FF]'
                                  }`}
                                >
                                  {statusOpt}
                                </button>
                              );
                            }
                          )}
                        </div>

                        <div className="overflow-x-auto rounded-md border border-[#203653] bg-[#0E192A]">
                          <table className="w-full border-collapse text-left font-mono text-[11px] tabular-nums">
                            <thead>
                              <tr className="border-b border-[#203653] bg-[#060B14] text-[10px] uppercase text-[#91A4BD]">
                                <th className="px-3 py-2">PIN &amp; Created</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">Remaining / Expiry</th>
                                <th className="px-3 py-2">Devices &amp; History</th>
                                <th className="px-3 py-2 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#203653]/70">
                              {adminAuditLoading && adminAuditTrials.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="px-3 py-5 text-center text-[#91A4BD]">
                                    Loading encrypted trial PIN audit records...
                                  </td>
                                </tr>
                              ) : filteredAdminTrials.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="px-3 py-5 text-center text-[#91A4BD]">
                                    {adminAuditTrials.length === 0
                                      ? 'No trial PINs generated yet. Issue a 3h–1y PIN above.'
                                      : 'No trial PIN records match the current status or keyword filter.'}
                                  </td>
                                </tr>
                              ) : (
                                filteredAdminTrials.map((tr) => {
                                  const liveRemSec =
                                    tr.status === 'ACTIVE' && tr.expiresAtMs
                                      ? Math.max(
                                          0,
                                          Math.floor(
                                            (tr.expiresAtMs -
                                              (adminNowTickMs + adminAuditServerSkewMs)) /
                                              1000
                                          )
                                        )
                                      : tr.remainingSeconds;
                                  const isLow =
                                    tr.status === 'ACTIVE' &&
                                    liveRemSec !== null &&
                                    liveRemSec > 0 &&
                                    liveRemSec < 1800;
                                  const isCrit =
                                    tr.status === 'ACTIVE' &&
                                    liveRemSec !== null &&
                                    liveRemSec > 0 &&
                                    liveRemSec <= 300;
                                  const isExpanded = Boolean(expandedTrialIds[tr.trialId]);

                                  const remainingPct = computeRemainingPercentForTrial(tr, liveRemSec);
                                  const statusBadgeClass =
                                    tr.status === 'ACTIVE'
                                      ? isCrit
                                        ? 'border-[#FF4D62]/65 bg-[#FF4D62]/15 text-[#FFD1D8]'
                                        : isLow
                                          ? 'border-[#FFB020]/55 bg-[#FFB020]/14 text-[#FFB020]'
                                          : 'border-[#20D889]/50 bg-[#20D889]/12 text-[#20D889]'
                                      : tr.status === 'UNUSED'
                                        ? 'border-[#19C8F5]/50 bg-[#19C8F5]/12 text-[#19C8F5]'
                                        : tr.status === 'REVOKED'
                                          ? 'border-[#FF4D62]/60 bg-[#FF4D62]/16 text-[#FFD1D8]'
                                          : 'border-[#FF4D62]/45 bg-[#FF4D62]/10 text-[#FF8B99]';
                                  const progressFillClass =
                                    tr.status === 'ACTIVE'
                                      ? isCrit
                                        ? 'bg-[#FF4D62]'
                                        : isLow || remainingPct < 25
                                          ? 'bg-[#FFB020]'
                                          : 'bg-[#20D889]'
                                      : tr.status === 'UNUSED'
                                        ? 'bg-[#19C8F5]/55'
                                        : 'bg-[#FF4D62]/60';

                                  return (
                                    <React.Fragment key={tr.trialId}>
                                      <tr className="hover:bg-[#132238]/60 align-top">
                                        <td className="px-3 py-2 font-bold text-[#EAF3FF]">
                                          <div className="flex items-center gap-1.5">
                                            <span>{tr.maskedPin}</span>
                                            <span className="text-[9.5px] font-normal text-[#19C8F5]">
                                              ({formatTrialDurationLabel(tr.durationHours, 'short')})
                                            </span>
                                          </div>
                                          <div className="text-[9.5px] font-normal text-[#91A4BD]">
                                            Created: {formatDate(tr.createdAtMs)}
                                          </div>
                                          {tr.notes && (
                                            <div className="text-[10px] font-normal text-[#D9E8FA] mt-0.5">
                                              {tr.notes}
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 font-bold whitespace-nowrap">
                                          <span
                                            data-testid={`audit-status-badge-${tr.trialId}`}
                                            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass}`}
                                          >
                                            {tr.status === 'ACTIVE' ? (
                                              isLow ? (
                                                <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                                              ) : (
                                                <CheckCircle2
                                                  className="h-3 w-3 shrink-0"
                                                  aria-hidden="true"
                                                />
                                              )
                                            ) : tr.status === 'UNUSED' ? (
                                              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                                            ) : tr.status === 'REVOKED' ? (
                                              <Ban className="h-3 w-3 shrink-0" aria-hidden="true" />
                                            ) : (
                                              <ShieldAlert
                                                className="h-3 w-3 shrink-0"
                                                aria-hidden="true"
                                              />
                                            )}
                                            <span>
                                              {tr.status === 'ACTIVE' && isLow
                                                ? 'EXPIRING'
                                                : tr.status}
                                            </span>
                                          </span>
                                          {tr.revokeReason && tr.status === 'REVOKED' && (
                                            <div className="mt-1 max-w-[140px] truncate text-[9.5px] font-normal text-[#FFD1D8]">
                                              {tr.revokeReason}
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap min-w-[170px]">
                                          {tr.status === 'ACTIVE' ? (
                                            <div className="space-y-1">
                                              <div className="flex items-center justify-between gap-2">
                                                <span
                                                  className={`inline-flex items-center gap-1 font-bold ${
                                                    isCrit
                                                      ? 'text-[#FF4D62]'
                                                      : isLow
                                                        ? 'text-[#FFB020]'
                                                        : 'text-[#19C8F5]'
                                                  }`}
                                                >
                                                  <Clock className="h-3 w-3 shrink-0" />
                                                  <span>
                                                    {formatTrialCountdown(liveRemSec)} left
                                                  </span>
                                                </span>
                                                <span className="text-[9.5px] text-[#91A4BD]">
                                                  {remainingPct}%
                                                </span>
                                              </div>
                                              <div
                                                role="progressbar"
                                                aria-label={`Remaining trial duration ${remainingPct}%`}
                                                aria-valuenow={remainingPct}
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                                className="h-1.5 w-full overflow-hidden rounded-full border border-[#203653] bg-[#060B14]"
                                              >
                                                <div
                                                  className={`h-full transition-[width] duration-300 ${progressFillClass}`}
                                                  style={{ width: `${remainingPct}%` }}
                                                />
                                              </div>
                                              <div className="text-[9.5px] text-[#91A4BD]">
                                                Ends: {formatDate(tr.expiresAtMs)}
                                              </div>
                                            </div>
                                          ) : tr.status === 'UNUSED' ? (
                                            <div className="space-y-1 text-[10px] text-[#91A4BD]">
                                              <div className="flex items-center justify-between gap-2">
                                                <span>
                                                  Full{' '}
                                                  {formatTrialDurationLabel(
                                                    tr.durationHours,
                                                    'full'
                                                  )}
                                                </span>
                                                <span>100%</span>
                                              </div>
                                              <div
                                                role="progressbar"
                                                aria-label="Unused trial window 100% available"
                                                aria-valuenow={100}
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                                className="h-1.5 w-full overflow-hidden rounded-full border border-[#203653] bg-[#060B14]"
                                              >
                                                <div
                                                  className={`h-full ${progressFillClass}`}
                                                  style={{ width: '100%' }}
                                                />
                                              </div>
                                              <div className="text-[9.5px]">
                                                Pickup by{' '}
                                                {new Date(tr.unusedExpiresAtMs).toLocaleDateString()}
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="space-y-1 text-[10px] text-[#91A4BD]">
                                              <div className="flex items-center justify-between gap-2">
                                                <span>00:00:00 left</span>
                                                <span className="text-[#FF4D62]">0%</span>
                                              </div>
                                              <div
                                                role="progressbar"
                                                aria-label="Remaining trial duration 0%"
                                                aria-valuenow={0}
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                                className="h-1.5 w-full overflow-hidden rounded-full border border-[#203653] bg-[#060B14]"
                                              >
                                                <div
                                                  className={`h-full ${progressFillClass}`}
                                                  style={{ width: '0%' }}
                                                />
                                              </div>
                                              <div className="text-[9.5px]">
                                                {tr.activatedAtMs
                                                  ? formatDate(tr.expiresAtMs)
                                                  : 'Unused expired'}
                                              </div>
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-[#91A4BD]">
                                          <div>
                                            <span
                                              className={
                                                tr.boundDeviceId
                                                  ? 'text-[#EAF3FF] font-semibold'
                                                  : 'text-[#91A4BD]'
                                              }
                                            >
                                              {tr.boundDeviceId ? '1/1 Bound' : '0/1 Unbound'}
                                            </span>
                                            {' · '}
                                            <span className="text-[#19C8F5]">
                                              {tr.totalDevicesUsed} total device
                                              {tr.totalDevicesUsed === 1 ? '' : 's'}
                                            </span>
                                          </div>
                                          <div className="text-[9.5px] truncate max-w-[180px]">
                                            {tr.boundDeviceLabel ||
                                              `${tr.totalActivations} login${tr.totalActivations === 1 ? '' : 's'} recorded`}
                                          </div>
                                          {tr.usageHistory.length > 0 && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setExpandedTrialIds((prev) => ({
                                                  ...prev,
                                                  [tr.trialId]: !prev[tr.trialId],
                                                }))
                                              }
                                              className="mt-1 inline-flex items-center gap-1 rounded border border-[#203653] bg-[#060B14] px-1.5 py-0.5 text-[9.5px] text-[#EAF3FF] hover:border-[#19C8F5]/60 cursor-pointer whitespace-nowrap"
                                            >
                                              {isExpanded ? (
                                                <ChevronUp className="h-3 w-3" />
                                              ) : (
                                                <ChevronDown className="h-3 w-3" />
                                              )}
                                              <span>
                                                History ({tr.usageHistory.length})
                                              </span>
                                            </button>
                                          )}
                                        </td>
                                        <td className="px-3 py-2">
                                          <div className="flex items-center justify-end gap-1.5">
                                            {tr.boundDeviceId && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  void handleResetTrialDevice(tr.trialId)
                                                }
                                                className="inline-flex items-center gap-1 rounded border border-[#19C8F5]/50 bg-[#19C8F5]/12 px-2 py-1 text-[10px] font-bold text-[#19C8F5] hover:bg-[#19C8F5]/22 cursor-pointer whitespace-nowrap"
                                              >
                                                <RotateCcw className="h-3 w-3" />
                                                <span>Reset Dev</span>
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              data-testid={`audit-revoke-btn-${tr.trialId}`}
                                              onClick={() => void handleToggleTrialRevoke(tr)}
                                              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                                                tr.status === 'REVOKED'
                                                  ? 'border-[#FFB020]/60 bg-[#FFB020]/15 text-[#FFB020] hover:bg-[#FFB020]/25'
                                                  : 'border-[#FF4D62]/65 bg-[#FF4D62]/15 text-[#FF4D62] hover:bg-[#FF4D62]/25'
                                              }`}
                                            >
                                              {tr.status === 'REVOKED' ? (
                                                <ShieldCheck className="h-3 w-3 shrink-0" />
                                              ) : (
                                                <Ban className="h-3 w-3 shrink-0" />
                                              )}
                                              <span>
                                                {tr.status === 'REVOKED' ? 'Restore' : 'Revoke'}
                                              </span>
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                      {isExpanded && tr.usageHistory.length > 0 && (
                                        <tr className="bg-[#060B14]/90">
                                          <td colSpan={5} className="px-4 py-2.5">
                                            <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-[#91A4BD]">
                                              <span>
                                                Cumulative Device Bind &amp; Usage History (
                                                {tr.totalDevicesUsed} Unique · {tr.totalActivations}{' '}
                                                Logins)
                                              </span>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                              {tr.usageHistory.map((dev, idx) => (
                                                <div
                                                  key={`${tr.trialId}-${dev.maskedDeviceId}-${idx}`}
                                                  className="flex items-center justify-between gap-2 rounded border border-[#203653] bg-[#0A1220] px-2.5 py-1.5 text-[10px]"
                                                >
                                                  <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 font-semibold text-[#EAF3FF] truncate">
                                                      <Laptop className="h-3 w-3 shrink-0 text-[#19C8F5]" />
                                                      <span className="truncate">
                                                        {dev.deviceLabel}
                                                      </span>
                                                      {dev.isCurrentlyBound && (
                                                        <span className="text-[#20D889] text-[9px] uppercase">
                                                          [Active]
                                                        </span>
                                                      )}
                                                    </div>
                                                    <div className="text-[#91A4BD]">
                                                      ID: {dev.maskedDeviceId} · Last:{' '}
                                                      {new Date(dev.lastSeenAtMs).toLocaleString()}
                                                    </div>
                                                  </div>
                                                  <div className="shrink-0 text-right text-[#19C8F5] font-bold">
                                                    {dev.activationCount}x
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-1 font-mono text-[10px]">
                          {(
                            [
                              'ALL',
                              'GENERATED',
                              'ACTIVATED',
                              'DEVICE_BIND',
                              'REVERIFIED',
                              'DEVICE_RESET',
                              'REVOKED',
                              'RESTORED',
                              'IMPORTED',
                            ] as const
                          ).map((evtOpt) => {
                            const selected = auditEventFilter === evtOpt;
                            return (
                              <button
                                key={evtOpt}
                                type="button"
                                onClick={() => setAuditEventFilter(evtOpt)}
                                className={`rounded border px-2 py-0.5 font-bold uppercase cursor-pointer whitespace-nowrap ${
                                  selected
                                    ? 'border-[#FFB020] bg-[#FFB020]/15 text-[#FFB020]'
                                    : 'border-[#203653] bg-[#060B14] text-[#91A4BD] hover:text-[#EAF3FF]'
                                }`}
                              >
                                {evtOpt.replace('_', ' ')}
                              </button>
                            );
                          })}
                        </div>

                        <div className="overflow-x-auto rounded-md border border-[#203653] bg-[#0E192A]">
                          <table className="w-full border-collapse text-left font-mono text-[10.5px] tabular-nums">
                            <thead>
                              <tr className="border-b border-[#203653] bg-[#060B14] text-[10px] uppercase text-[#91A4BD]">
                                <th className="px-3 py-2">Timestamp</th>
                                <th className="px-3 py-2">Event</th>
                                <th className="px-3 py-2">PIN</th>
                                <th className="px-3 py-2">Actor / Workstation</th>
                                <th className="px-3 py-2">Audit Detail</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#203653]/70">
                              {filteredAuditLog.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="px-3 py-5 text-center text-[#91A4BD]">
                                    No audit log events match the active filter.
                                  </td>
                                </tr>
                              ) : (
                                filteredAuditLog.map((evt) => (
                                  <tr key={evt.eventId} className="hover:bg-[#132238]/60 align-top">
                                    <td className="px-3 py-2 whitespace-nowrap text-[#91A4BD]">
                                      {new Date(evt.timestampMs).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap font-bold">
                                      <span
                                        className={
                                          evt.eventType === 'REVOKED'
                                            ? 'text-[#FF4D62]'
                                            : evt.eventType === 'GENERATED'
                                              ? 'text-[#FFB020]'
                                              : evt.eventType === 'ACTIVATED' ||
                                                  evt.eventType === 'RESTORED'
                                                ? 'text-[#20D889]'
                                                : 'text-[#19C8F5]'
                                        }
                                      >
                                        {evt.eventType.replace('_', ' ')}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-[#EAF3FF]">
                                      {evt.maskedPin}{' '}
                                      <span className="text-[#91A4BD]">
                                        ({formatTrialDurationLabel(evt.durationHours, 'short')})
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-[#EAF3FF]">
                                      <div className="truncate max-w-[160px]">{evt.actor}</div>
                                      {evt.maskedDeviceId && (
                                        <div className="text-[9.5px] text-[#91A4BD]">
                                          {evt.maskedDeviceId}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-[#D9E8FA]">{evt.detail}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </motion.div>
    </div>,
    document.body
  );
};
