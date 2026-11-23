import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Lock,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useTrialAccess } from '../../context/TrialAccessContext';
import { getAdminPinToken } from '../../services/trialPinClientService';
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

  const [activeTab, setActiveTab] = useState<'LICENSE_GEN' | 'QR_UPLOAD'>('LICENSE_GEN');
  const [durationDays, setDurationDays] = useState<SubscriptionDurationDays>(30);
  const [technicianNote, setTechnicianNote] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedRecord, setGeneratedRecord] = useState<IssuedOfflineLicenseRecord | null>(null);
  const [ledger, setLedger] = useState<IssuedOfflineLicenseRecord[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Admin E-Wallet QR Uploader state
  const [accountName, setAccountName] = useState(qrConfig.accountName);
  const [accountNumber, setAccountNumber] = useState(qrConfig.accountNumber);
  const [instructionsTaglish, setInstructionsTaglish] = useState(qrConfig.instructionsTaglish);
  const [previewQrDataUrl, setPreviewQrDataUrl] = useState<string | null>(
    qrConfig.qrImageDataUrl
  );
  const [isCompressing, setIsCompressing] = useState(false);
  const [qrSaveNotice, setQrSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    setAccountName(qrConfig.accountName);
    setAccountNumber(qrConfig.accountNumber);
    setInstructionsTaglish(qrConfig.instructionsTaglish);
    setPreviewQrDataUrl(qrConfig.qrImageDataUrl);
  }, [qrConfig]);

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
    }
  }, [isOpen, isAdminUnlocked, fetchLedger]);

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
            <div className="flex gap-2 border-b border-slate-800 pb-3">
              <button
                type="button"
                onClick={() => setActiveTab('LICENSE_GEN')}
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
                onClick={() => setActiveTab('QR_UPLOAD')}
                className={`px-3 py-1.5 rounded-md border font-mono text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'QR_UPLOAD'
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Admin E-Wallet QR Uploader</span>
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
            ) : (
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
            )}
          </div>
        )}
      </div>
    </div>
  );
};
