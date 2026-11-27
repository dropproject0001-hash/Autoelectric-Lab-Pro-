/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useTrialAccess } from '../../context/TrialAccessContext';
import {
  type AdminPinConfigStatus,
  changeAdminMasterPinClient,
  fetchAdminPinConfigStatus,
  getAdminPinToken,
  setAdminPinToken,
} from '../../services/trialPinClientService';
import {
  isSecondaryConfirmationSatisfied,
  maskMasterAdminPin,
  SECONDARY_CONFIRMATION_KEYWORD,
  validateMasterPinModification,
} from '../../utils/adminPinValidation';
import {
  compressQrImageFile,
  savePaymentQrConfig,
  usePaymentQrConfig,
} from '../../services/billing/qrConfigService';
import type {
  IssuedOfflineLicenseRecord,
  SubscriptionDurationDays,
} from '../../server/services/offlineLicenseCrypto';

interface AdminPinManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DURATION_OPTIONS: Array<{ days: SubscriptionDurationDays; label: string }> = [
  { days: 30, label: '30 Days (Shop Pass)' },
  { days: 90, label: '90 Days (Quarter Pro)' },
  { days: 180, label: '180 Days (6-Mo Pro)' },
  { days: 365, label: '365 Days (1-Yr VIP)' },
  { days: 36500, label: 'Lifetime Fleet' },
];

export const AdminPinManagerModal: React.FC<AdminPinManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { isAdminUnlocked, openAccessModal } = useTrialAccess();
  const qrConfig = usePaymentQrConfig();

  const [activeTab, setActiveTab] = useState<'LICENSE_GEN' | 'QR_UPLOAD' | 'MASTER_PIN'>(
    'LICENSE_GEN'
  );
  const [durationDays, setDurationDays] = useState<SubscriptionDurationDays>(30);
  const [technicianNote, setTechnicianNote] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedRecord, setGeneratedRecord] = useState<IssuedOfflineLicenseRecord | null>(null);
  const [ledger, setLedger] = useState<IssuedOfflineLicenseRecord[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Master Admin PIN Validation & Secondary Confirmation state
  const [adminPinConfig, setAdminPinConfig] = useState<AdminPinConfigStatus | null>(null);
  const [isLoadingPinConfig, setIsLoadingPinConfig] = useState(false);
  const [currentMasterPinInput, setCurrentMasterPinInput] = useState('');
  const [newMasterPinInput, setNewMasterPinInput] = useState('');
  const [confirmNewMasterPinInput, setConfirmNewMasterPinInput] = useState('');
  const [showCurrentMasterPin, setShowCurrentMasterPin] = useState(false);
  const [showNewMasterPin, setShowNewMasterPin] = useState(false);
  const [pinValidationErrors, setPinValidationErrors] = useState<string[]>([]);
  const [pendingSecondaryConfirmation, setPendingSecondaryConfirmation] = useState(false);
  const [secondaryAckChecked, setSecondaryAckChecked] = useState(false);
  const [secondaryConfirmKeywordInput, setSecondaryConfirmKeywordInput] = useState('');
  const [isUpdatingMasterPin, setIsUpdatingMasterPin] = useState(false);
  const [masterPinStatusMsg, setMasterPinStatusMsg] = useState<string | null>(null);
  const [masterPinErrorMsg, setMasterPinErrorMsg] = useState<string | null>(null);

  // Admin E-Wallet QR Uploader state
  const [accountName, setAccountName] = useState(qrConfig.accountName);
  const [accountNumber, setAccountNumber] = useState(qrConfig.accountNumber);
  const [instructionsTaglish, setInstructionsTaglish] = useState(qrConfig.instructionsTaglish);
  const [previewQrDataUrl, setPreviewQrDataUrl] = useState<string | null>(
    qrConfig.qrImageDataUrl
  );
  const [isCompressing, setIsCompressing] = useState(false);
  const [qrSaveNotice, setQrSaveNotice] = useState<string | null>(null);

  const resetMasterPinFormState = useCallback((clearMessages = true) => {
    setCurrentMasterPinInput('');
    setNewMasterPinInput('');
    setConfirmNewMasterPinInput('');
    setShowCurrentMasterPin(false);
    setShowNewMasterPin(false);
    setPinValidationErrors([]);
    setPendingSecondaryConfirmation(false);
    setSecondaryAckChecked(false);
    setSecondaryConfirmKeywordInput('');
    if (clearMessages) {
      setMasterPinStatusMsg(null);
      setMasterPinErrorMsg(null);
    }
  }, []);

  useEffect(() => {
    setAccountName(qrConfig.accountName);
    setAccountNumber(qrConfig.accountNumber);
    setInstructionsTaglish(qrConfig.instructionsTaglish);
    setPreviewQrDataUrl(qrConfig.qrImageDataUrl);
  }, [qrConfig]);

  const loadMasterPinConfig = useCallback(async () => {
    setIsLoadingPinConfig(true);
    try {
      const cfg = await fetchAdminPinConfigStatus();
      setAdminPinConfig(cfg);
    } catch {
      setAdminPinConfig(null);
    } finally {
      setIsLoadingPinConfig(false);
    }
  }, []);

  const fetchLedger = useCallback(async () => {
    const token = getAdminPinToken();
    if (!token) return;
    try {
      const res = await fetch('/api/admin/licenses', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      if (res.status === 401) {
        setAdminPinToken(null);
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as { licenses?: IssuedOfflineLicenseRecord[] };
        if (Array.isArray(data.licenses)) {
          setLedger(data.licenses);
        }
      }
    } catch {
      // Non-fatal while offline
    }
  }, []);

  useEffect(() => {
    if (isOpen && isAdminUnlocked) {
      void fetchLedger();
      void loadMasterPinConfig();
    } else if (!isOpen) {
      resetMasterPinFormState(true);
    }
  }, [isOpen, isAdminUnlocked, fetchLedger, loadMasterPinConfig, resetMasterPinFormState]);

  if (!isOpen) return null;

  const handleGenerateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    const token = getAdminPinToken();
    if (!token) {
      setErrorMessage('Master Admin PIN session required. Unlock via Admin PIN first.');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch('/api/admin/generate-license', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          durationDays,
          technicianNote: technicianNote.trim(),
        }),
      });
      const data = (await res.json()) as {
        record?: IssuedOfflineLicenseRecord;
        error?: string;
      };
      if (!res.ok || !data.record) {
        if (res.status === 401) {
          setAdminPinToken(null);
        }
        setErrorMessage(data.error || `Failed to generate signed license (HTTP ${res.status}).`);
        return;
      }
      setGeneratedRecord(data.record);
      setTechnicianNote('');
      setStatusMessage(`Signed offline license ${data.record.licenseKey} issued.`);
      void fetchLedger();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error generating license.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopySmsTemplate = async (record: IssuedOfflineLicenseRecord) => {
    const sms = [
      'AutoElectric Lab Pro — Official PRO License Activation',
      `License Key: ${record.licenseKey}`,
      `Duration: ${record.payload.durationDays} Days (Expires: ${new Date(record.payload.expiresAtMs).toLocaleDateString()})`,
      record.payload.technicianNote ? `Technician: ${record.payload.technicianNote}` : null,
      '',
      'Paste this full signed activation code in the Upgrade / PRO PIN modal:',
      record.signedActivationCode,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(sms);
      setStatusMessage('Copied PIN & Ready-to-Send SMS/Messenger Message!');
    } catch {
      setStatusMessage('Clipboard blocked — copy manually from the box below.');
    }
  };

  const handleQrFileSelected = async (file: File | null) => {
    if (!file) return;
    setIsCompressing(true);
    setQrSaveNotice(null);
    try {
      const compressed = await compressQrImageFile(file, 600);
      setPreviewQrDataUrl(compressed);
      setQrSaveNotice('QR compressed to max 600×600px PNG. Click "Save & Publish QR" to go live.');
    } catch (err) {
      setQrSaveNotice(err instanceof Error ? err.message : 'Failed to process QR image.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handlePublishQrConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await savePaymentQrConfig({
      accountName,
      accountNumber,
      instructionsTaglish,
      qrImageDataUrl: previewQrDataUrl,
    });
    setQrSaveNotice('Saved & Published to AutoLabPro_BillingConfig! Live inside Upgrade modal.');
  };

  const livePinValidation = validateMasterPinModification({
    currentPin: currentMasterPinInput,
    newPin: newMasterPinInput,
    confirmNewPin: confirmNewMasterPinInput,
    config: adminPinConfig,
  });

  const handleStageMasterPinModification = (e: React.FormEvent) => {
    e.preventDefault();
    setMasterPinStatusMsg(null);
    setMasterPinErrorMsg(null);

    const validation = validateMasterPinModification({
      currentPin: currentMasterPinInput,
      newPin: newMasterPinInput,
      confirmNewPin: confirmNewMasterPinInput,
      config: adminPinConfig,
    });

    if (!validation.valid) {
      setPinValidationErrors(validation.errors);
      setPendingSecondaryConfirmation(false);
      return;
    }

    setPinValidationErrors([]);
    setSecondaryAckChecked(false);
    setSecondaryConfirmKeywordInput('');
    setPendingSecondaryConfirmation(true);
  };

  const handleConfirmMasterPinModification = async (e: React.FormEvent) => {
    e.preventDefault();
    setMasterPinStatusMsg(null);
    setMasterPinErrorMsg(null);

    const validation = validateMasterPinModification({
      currentPin: currentMasterPinInput,
      newPin: newMasterPinInput,
      confirmNewPin: confirmNewMasterPinInput,
      config: adminPinConfig,
    });

    if (!validation.valid) {
      setPinValidationErrors(validation.errors);
      setPendingSecondaryConfirmation(false);
      return;
    }

    if (
      !isSecondaryConfirmationSatisfied({
        acknowledged: secondaryAckChecked,
        confirmationText: secondaryConfirmKeywordInput,
      })
    ) {
      setMasterPinErrorMsg(
        `Secondary confirmation required: check the acknowledgment box and type ${SECONDARY_CONFIRMATION_KEYWORD}.`
      );
      return;
    }

    setIsUpdatingMasterPin(true);
    try {
      await changeAdminMasterPinClient(currentMasterPinInput, newMasterPinInput);
      resetMasterPinFormState(false);
      setMasterPinStatusMsg(
        'Master Admin PIN updated securely. Previous Admin Console sessions have been invalidated.'
      );
      await loadMasterPinConfig();
    } catch (err) {
      setMasterPinErrorMsg(
        err instanceof Error ? err.message : 'Failed to update Master Admin PIN.'
      );
    } finally {
      setIsUpdatingMasterPin(false);
    }
  };

  const handleTabChange = (nextTab: 'LICENSE_GEN' | 'QR_UPLOAD' | 'MASTER_PIN') => {
    if (nextTab !== 'MASTER_PIN') {
      resetMasterPinFormState(true);
    }
    setActiveTab(nextTab);
  };

  return (
    <div
      data-testid="admin-pin-manager-modal"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Master Admin Offline License Generator and E-Wallet QR Manager"
    >
      <div className="w-full max-w-4xl max-h-[92dvh] rounded-xl border border-amber-500/50 bg-[#070E1B] shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B1528] shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-hud text-sm sm:text-base font-bold">
                Master Admin — Offline License &amp; E-Wallet QR Manager
              </h2>
              <p className="font-mono text-[10px] text-slate-400">
                Server-Side ECDSA P-256 Signer · Active License Ledger · GCash/Maya QR Config
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
            aria-label="Close Admin Billing Manager"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isAdminUnlocked ? (
          <div className="p-8 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full border border-amber-500/60 bg-amber-950/50 flex items-center justify-center">
              <Lock className="w-6 h-6 text-amber-300" />
            </div>
            <h3 className="font-hud text-sm font-bold text-amber-200">
              Protected by Master Admin PIN
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Signing offline ECDSA P-256 license keys and publishing official GCash/Maya QR codes require an authenticated Master Admin PIN session.
            </p>
            <button
              type="button"
              onClick={() => openAccessModal({ tab: 'ADMIN_GEN' })}
              className="hw-btn hw-btn-amber px-4 py-2 rounded-md font-mono text-xs font-semibold cursor-pointer"
            >
              Unlock Master Admin PIN
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
              <button
                type="button"
                onClick={() => handleTabChange('LICENSE_GEN')}
                className={`px-3 py-1.5 rounded-md border font-mono text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'LICENSE_GEN'
                    ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Offline PIN Generator &amp; Ledger</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('QR_UPLOAD')}
                className={`px-3 py-1.5 rounded-md border font-mono text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'QR_UPLOAD'
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Admin E-Wallet QR Uploader</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('MASTER_PIN')}
                data-testid="tab-master-pin-security"
                className={`px-3 py-1.5 rounded-md border font-mono text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'MASTER_PIN'
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Master Admin PIN</span>
              </button>
            </div>

            {activeTab === 'LICENSE_GEN' ? (
              <div className="space-y-4">
                <form
                  onSubmit={handleGenerateLicense}
                  className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
                >
                  <label className="space-y-1">
                    <span className="font-mono text-[10px] text-slate-400">Duration</span>
                    <select
                      value={durationDays}
                      onChange={(e) =>
                        setDurationDays(Number(e.target.value) as SubscriptionDurationDays)
                      }
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 font-mono text-xs text-slate-100"
                    >
                      {DURATION_OPTIONS.map((opt) => (
                        <option key={opt.days} value={opt.days}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="font-mono text-[10px] text-slate-400">
                      Technician / Shop Note
                    </span>
                    <input
                      type="text"
                      value={technicianNote}
                      onChange={(e) => setTechnicianNote(e.target.value)}
                      placeholder="e.g. Juan Dela Cruz — Cavite Shop"
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={isGenerating}
                    className="py-2 px-4 rounded-md border border-amber-500/70 bg-amber-600/30 hover:bg-amber-500/40 disabled:opacity-50 font-mono text-xs font-bold text-amber-100 cursor-pointer"
                  >
                    {isGenerating ? 'Signing ECDSA Key...' : 'Generate Signed PRO PIN'}
                  </button>
                </form>

                {errorMessage && (
                  <div className="rounded border border-rose-500/60 bg-rose-950/50 px-3 py-2 font-mono text-[11px] text-rose-200">
                    {errorMessage}
                  </div>
                )}

                {statusMessage && (
                  <div className="rounded border border-emerald-500/60 bg-emerald-950/40 px-3 py-2 font-mono text-[11px] text-emerald-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{statusMessage}</span>
                  </div>
                )}

                {generatedRecord && (
                  <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/25 p-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-emerald-300">
                        {generatedRecord.licenseKey} ({generatedRecord.payload.durationDays} Days)
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopySmsTemplate(generatedRecord)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-emerald-400/70 bg-emerald-500/20 hover:bg-emerald-500/30 font-mono text-[11px] font-semibold text-emerald-100 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy PIN &amp; Ready-to-Send SMS/Messenger Message</span>
                      </button>
                    </div>
                    <pre className="rounded border border-slate-800 bg-slate-950 p-2.5 font-mono text-[10px] text-cyan-200 whitespace-pre-wrap break-all">
                      {generatedRecord.signedActivationCode}
                    </pre>
                  </div>
                )}

                {/* Active License Ledger */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800">
                    <span className="font-hud text-xs font-bold text-slate-200">
                      Active License Ledger ({ledger.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => void fetchLedger()}
                      className="inline-flex items-center gap-1 font-mono text-[10.5px] text-cyan-300 hover:text-cyan-200 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Refresh
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-[11px]">
                      <thead className="bg-slate-950 text-slate-400">
                        <tr>
                          <th className="px-3 py-2">License Key</th>
                          <th className="px-3 py-2">Duration</th>
                          <th className="px-3 py-2">Technician Note</th>
                          <th className="px-3 py-2">Issued</th>
                          <th className="px-3 py-2">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {ledger.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                              No offline PRO PINs generated in this server session yet.
                            </td>
                          </tr>
                        ) : (
                          ledger.map((row) => (
                            <tr key={row.licenseKey} className="hover:bg-slate-900/80">
                              <td className="px-3 py-2 font-bold text-emerald-300">
                                {row.licenseKey}
                              </td>
                              <td className="px-3 py-2 text-slate-300">
                                {row.payload.durationDays}d
                              </td>
                              <td className="px-3 py-2 text-slate-300">
                                {row.payload.technicianNote || '—'}
                              </td>
                              <td className="px-3 py-2 text-slate-400">
                                {new Date(row.createdAtIso).toLocaleString()}
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => void handleCopySmsTemplate(row)}
                                  className="text-cyan-300 hover:underline cursor-pointer"
                                >
                                  Copy SMS
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : activeTab === 'QR_UPLOAD' ? (
              /* Admin E-Wallet QR Uploader */
              <form
                onSubmit={handlePublishQrConfig}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <label className="block border-2 border-dashed border-cyan-500/50 hover:border-cyan-400 rounded-xl p-4 text-center cursor-pointer bg-slate-950/70">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => void handleQrFileSelected(e.target.files?.[0] || null)}
                    />
                    <Upload className="w-6 h-6 text-cyan-400 mx-auto mb-1.5" />
                    <div className="font-mono text-xs font-semibold text-cyan-200">
                      {isCompressing
                        ? 'Auto-compressing to 600×600px PNG...'
                        : 'Drop or Browse GCash / Maya QR Photo'}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400 mt-1">
                      Canvas compressor enforces max 600×600px for crisp dark-mode scanning
                    </div>
                  </label>

                  <label className="block space-y-1">
                    <span className="font-mono text-[10px] text-slate-400">Account Name</span>
                    <input
                      type="text"
                      required
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="font-mono text-[10px] text-slate-400">
                      GCash / Maya Account Number
                    </span>
                    <input
                      type="text"
                      required
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="font-mono text-[10px] text-slate-400">
                      Checkout Instructions (Taglish)
                    </span>
                    <textarea
                      rows={2}
                      value={instructionsTaglish}
                      onChange={(e) => setInstructionsTaglish(e.target.value)}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
                    />
                  </label>

                  <button
                    type="submit"
                    className="w-full py-2 rounded-md border border-cyan-500/70 bg-cyan-600/30 hover:bg-cyan-500/40 font-mono text-xs font-bold text-cyan-100 cursor-pointer"
                  >
                    Save &amp; Publish QR
                  </button>

                  {qrSaveNotice && (
                    <div className="rounded border border-emerald-500/60 bg-emerald-950/40 p-2 font-mono text-[10.5px] text-emerald-200">
                      {qrSaveNotice}
                    </div>
                  )}
                </div>

                {/* Live Side-by-Side Quiet-Zone Preview */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col items-center justify-center space-y-3">
                  <span className="font-mono text-[10.5px] uppercase text-slate-400">
                    Live Upgrade Modal Preview (White Quiet-Zone)
                  </span>
                  <div className="bg-white p-4 rounded-xl border-4 border-white shadow-xl inline-flex flex-col items-center">
                    {previewQrDataUrl ? (
                      <img
                        src={previewQrDataUrl}
                        alt="Live E-Wallet QR Preview"
                        className="w-48 h-48 object-contain"
                      />
                    ) : (
                      <div className="w-48 h-48 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-300 rounded-lg">
                        <QrCode className="w-10 h-10 mb-1" />
                        <span className="font-mono text-[11px]">No QR selected</span>
                      </div>
                    )}
                    <span className="mt-2 font-mono text-[11px] font-bold text-slate-800">
                      {accountName || 'Account Name'}
                    </span>
                    <span className="font-mono text-[10px] text-slate-600">
                      {accountNumber || 'GCash / Maya Number'}
                    </span>
                  </div>
                </div>
              </form>
            ) : (
              /* Master Admin PIN Validation & Secondary Confirmation Layer */
              <div className="space-y-4" data-testid="master-pin-manager-panel">
                {/* Masked Active PIN Status Banner */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                      Currently Active Master Admin PIN
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span
                        data-testid="masked-active-master-pin"
                        className="rounded border border-slate-700 bg-slate-950 px-3 py-1 font-mono text-sm font-bold tracking-[0.25em] text-amber-300 select-none"
                      >
                        {adminPinConfig?.pinInitialized ? maskMasterAdminPin(null, 8) : 'NOT INITIALIZED'}
                      </span>
                      <span className="font-mono text-[10.5px] text-slate-300">
                        {isLoadingPinConfig
                          ? 'Checking server status...'
                          : adminPinConfig?.masterEnvConfigured
                            ? 'Server Env Managed (VECL_ADMIN_MASTER_PIN)'
                            : adminPinConfig?.adminClaimed
                              ? 'Claimed Workstation Credential (scrypt-hashed)'
                              : 'Unclaimed'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadMasterPinConfig()}
                    disabled={isLoadingPinConfig}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-[10.5px] text-cyan-300 hover:border-cyan-500/60 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPinConfig ? 'animate-spin' : ''}`} />
                    <span>Refresh Status</span>
                  </button>
                </div>

                {masterPinErrorMsg && (
                  <div className="rounded border border-rose-500/60 bg-rose-950/50 px-3 py-2 font-mono text-[11px] text-rose-200">
                    {masterPinErrorMsg}
                  </div>
                )}

                {masterPinStatusMsg && (
                  <div className="rounded border border-emerald-500/60 bg-emerald-950/40 px-3 py-2 font-mono text-[11px] text-emerald-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{masterPinStatusMsg}</span>
                  </div>
                )}

                {adminPinConfig?.masterEnvConfigured ? (
                  <div className="rounded-xl border border-amber-500/45 bg-amber-950/20 p-4 space-y-2">
                    <div className="flex items-center gap-2 font-hud text-xs font-bold uppercase text-amber-300">
                      <Lock className="w-4 h-4 shrink-0" />
                      <span>Environment-Managed Secret Lock</span>
                    </div>
                    <p className="font-mono text-[11px] text-slate-300 leading-relaxed">
                      The active Master Admin PIN (<span className="text-amber-300 tracking-widest">{maskMasterAdminPin(null, 8)}</span>) is managed exclusively via the server <code className="text-slate-100">VECL_ADMIN_MASTER_PIN</code> environment variable and cannot be modified from the browser UI. Rotate the value in your deployment secrets and restart the server.
                    </p>
                  </div>
                ) : !pendingSecondaryConfirmation ? (
                  <form
                    onSubmit={handleStageMasterPinModification}
                    className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-4"
                    data-testid="master-pin-validation-form"
                  >
                    <div className="border-b border-slate-800 pb-2.5">
                      <h3 className="font-hud text-xs font-bold uppercase tracking-wider text-amber-300">
                        Step 1 — Validate Active PIN &amp; Proposed Rotation
                      </h3>
                      <p className="font-mono text-[10.5px] text-slate-400 mt-0.5">
                        Your current active PIN stays masked. All validation rules must pass before proceeding to secondary confirmation.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <label className="space-y-1">
                        <span className="font-mono text-[10px] uppercase text-slate-400">
                          Current Active PIN
                        </span>
                        <div className="relative">
                          <input
                            type={showCurrentMasterPin ? 'text' : 'password'}
                            autoComplete="current-password"
                            value={currentMasterPinInput}
                            onChange={(e) => {
                              setCurrentMasterPinInput(e.target.value);
                              setPinValidationErrors([]);
                            }}
                            placeholder="••••••••"
                            required
                            className="w-full rounded border border-slate-700 bg-slate-950 pl-2.5 pr-8 py-2 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentMasterPin((v) => !v)}
                            aria-label={showCurrentMasterPin ? 'Mask current PIN' : 'Reveal current PIN'}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                          >
                            {showCurrentMasterPin ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </label>

                      <label className="space-y-1">
                        <span className="font-mono text-[10px] uppercase text-slate-400">
                          New Master PIN (6–12 Digits)
                        </span>
                        <div className="relative">
                          <input
                            type={showNewMasterPin ? 'text' : 'password'}
                            inputMode="numeric"
                            autoComplete="new-password"
                            value={newMasterPinInput}
                            onChange={(e) => {
                              setNewMasterPinInput(e.target.value.replace(/\D/g, '').slice(0, 12));
                              setPinValidationErrors([]);
                            }}
                            placeholder="6–12 digits"
                            required
                            className="w-full rounded border border-slate-700 bg-slate-950 pl-2.5 pr-8 py-2 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewMasterPin((v) => !v)}
                            aria-label={showNewMasterPin ? 'Mask new PIN' : 'Reveal new PIN'}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                          >
                            {showNewMasterPin ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </label>

                      <label className="space-y-1">
                        <span className="font-mono text-[10px] uppercase text-slate-400">
                          Confirm New Master PIN
                        </span>
                        <input
                          type={showNewMasterPin ? 'text' : 'password'}
                          inputMode="numeric"
                          autoComplete="new-password"
                          value={confirmNewMasterPinInput}
                          onChange={(e) => {
                            setConfirmNewMasterPinInput(
                              e.target.value.replace(/\D/g, '').slice(0, 12)
                            );
                            setPinValidationErrors([]);
                          }}
                          placeholder="Re-enter new PIN"
                          required
                          className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                        />
                      </label>
                    </div>

                    {/* Validation Policy Checklist */}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/75 p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[10.5px]">
                      <div className={livePinValidation.checks.currentPinPresent ? 'text-emerald-300' : 'text-slate-400'}>
                        {livePinValidation.checks.currentPinPresent ? '✓' : '○'} Current active PIN entered (masked)
                      </div>
                      <div className={livePinValidation.checks.newPinFormatValid ? 'text-emerald-300' : 'text-slate-400'}>
                        {livePinValidation.checks.newPinFormatValid ? '✓' : '○'} New PIN is 6–12 numeric digits
                      </div>
                      <div className={livePinValidation.checks.newPinNotTrivial ? 'text-emerald-300' : 'text-slate-400'}>
                        {livePinValidation.checks.newPinNotTrivial ? '✓' : '○'} Not a repeated or sequential pattern
                      </div>
                      <div className={livePinValidation.checks.newPinDiffersFromCurrent ? 'text-emerald-300' : 'text-slate-400'}>
                        {livePinValidation.checks.newPinDiffersFromCurrent ? '✓' : '○'} Distinct from currently active PIN
                      </div>
                      <div className={livePinValidation.checks.confirmMatchesNewPin ? 'text-emerald-300' : 'text-slate-400'}>
                        {livePinValidation.checks.confirmMatchesNewPin ? '✓' : '○'} Confirmation entry matches new PIN
                      </div>
                    </div>

                    {pinValidationErrors.length > 0 && (
                      <div
                        data-testid="master-pin-validation-errors"
                        className="rounded border border-rose-500/60 bg-rose-950/45 p-3 space-y-1 font-mono text-[11px] text-rose-200"
                      >
                        {pinValidationErrors.map((errText) => (
                          <div key={errText}>• {errText}</div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        data-testid="master-pin-review-button"
                        className="py-2 px-4 rounded-md border border-amber-500/70 bg-amber-600/30 hover:bg-amber-500/40 font-mono text-xs font-bold text-amber-100 cursor-pointer"
                      >
                        Validate &amp; Continue to Secondary Confirmation
                      </button>
                    </div>
                  </form>
                ) : (
                  /* Step 2: Mandatory Secondary Confirmation Gate */
                  <form
                    onSubmit={(e) => void handleConfirmMasterPinModification(e)}
                    className="rounded-xl border border-amber-500/65 bg-amber-950/20 p-4 space-y-4"
                    data-testid="master-pin-secondary-confirmation"
                  >
                    <div className="flex items-start gap-2.5 border-b border-amber-500/30 pb-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-hud text-xs font-bold uppercase tracking-wider text-amber-200">
                          Step 2 — Secondary Confirmation Required
                        </h3>
                        <p className="font-mono text-[10.5px] text-slate-300 mt-0.5">
                          Modifying the Master Admin PIN immediately revokes all other active administrator console sessions. Review masked values below before confirming.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-800 bg-slate-950/80 p-3 font-mono text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">
                          Current Active PIN (Masked)
                        </span>
                        <span className="text-slate-200 tracking-[0.2em] font-bold">
                          {maskMasterAdminPin(currentMasterPinInput)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">
                          Proposed New PIN (Masked)
                        </span>
                        <span className="text-emerald-300 tracking-[0.2em] font-bold">
                          {maskMasterAdminPin(newMasterPinInput)}
                        </span>
                      </div>
                    </div>

                    <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <input
                        type="checkbox"
                        checked={secondaryAckChecked}
                        onChange={(e) => setSecondaryAckChecked(e.target.checked)}
                        className="mt-0.5 accent-amber-500"
                      />
                      <span className="font-mono text-[11px] text-slate-200">
                        I confirm modifying the Master Admin PIN and understand existing admin tokens will be invalidated.
                      </span>
                    </label>

                    <label className="block space-y-1">
                      <span className="font-mono text-[10px] uppercase text-slate-400">
                        Type <strong className="text-amber-300">{SECONDARY_CONFIRMATION_KEYWORD}</strong> to authorize modification
                      </span>
                      <input
                        type="text"
                        value={secondaryConfirmKeywordInput}
                        onChange={(e) => setSecondaryConfirmKeywordInput(e.target.value)}
                        placeholder={SECONDARY_CONFIRMATION_KEYWORD}
                        required
                        className="w-full sm:max-w-xs rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs uppercase text-amber-200 focus:border-amber-400 focus:outline-none"
                      />
                    </label>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isUpdatingMasterPin}
                        onClick={() => {
                          setPendingSecondaryConfirmation(false);
                          setSecondaryAckChecked(false);
                          setSecondaryConfirmKeywordInput('');
                          setMasterPinErrorMsg(null);
                        }}
                        className="py-2 px-3.5 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 font-mono text-xs text-slate-300 cursor-pointer"
                      >
                        Back to Edit
                      </button>

                      <button
                        type="submit"
                        disabled={
                          isUpdatingMasterPin ||
                          !isSecondaryConfirmationSatisfied({
                            acknowledged: secondaryAckChecked,
                            confirmationText: secondaryConfirmKeywordInput,
                          })
                        }
                        data-testid="master-pin-confirm-submit"
                        className="py-2 px-4 rounded-md border border-emerald-500/70 bg-emerald-600/30 hover:bg-emerald-500/40 disabled:opacity-45 font-mono text-xs font-bold text-emerald-100 cursor-pointer"
                      >
                        {isUpdatingMasterPin
                          ? 'Rotating Master Admin PIN...'
                          : 'Confirm & Update Master Admin PIN'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
