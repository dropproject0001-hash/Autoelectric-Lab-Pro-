/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  QrCode,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { usePaymentQrConfig } from '../../services/billing/qrConfigService';
import {
  activateOfflineLicenseCode,
  type LicenseStatusView,
} from '../../services/billing/licenseVerificationService';
import type { BilingualLang } from '../../types/aiAssistant';

interface SubscriptionPricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: BilingualLang;
  onLicenseActivated?: (view: LicenseStatusView) => void;
}

interface PlanTier {
  id: 'SHOP_30D' | 'PRO_180D' | 'VIP_365D';
  name: string;
  durationDays: number;
  priceLabel: string;
  badge?: string;
  featuresTaglish: string[];
  featuresEnglish: string[];
}

const PLAN_TIERS: PlanTier[] = [
  {
    id: 'SHOP_30D',
    name: '1-Month Shop Pass',
    durationDays: 30,
    priceLabel: 'PHP 499 / 30 Days',
    featuresTaglish: [
      'Full 100% Offline Bench MNA & Oscilloscope',
      'University Lab Mode & Verified Exam PDF',
      'Hands-Free Natural Taglish AI Voice Coach',
    ],
    featuresEnglish: [
      'Full 100% Offline Bench MNA & Oscilloscope',
      'University Lab Mode & Verified Exam PDF',
      'Hands-Free Natural Taglish AI Voice Coach',
    ],
  },
  {
    id: 'PRO_180D',
    name: '6-Month Pro Pass',
    durationDays: 180,
    priceLabel: 'PHP 2,499 / 180 Days',
    badge: 'MOST POPULAR',
    featuresTaglish: [
      'Lahat ng Shop Pass features + priority updates',
      'ECDSA P-256 offline-signed workstation lock',
      'Unlimited PCB Schematic & DTC diagnostic logs',
    ],
    featuresEnglish: [
      'All Shop Pass features + priority updates',
      'ECDSA P-256 offline-signed workstation lock',
      'Unlimited PCB Schematic & DTC diagnostic logs',
    ],
  },
  {
    id: 'VIP_365D',
    name: '1-Year VIP Pass',
    durationDays: 365,
    priceLabel: 'PHP 4,499 / 365 Days',
    badge: 'BEST VALUE',
    featuresTaglish: [
      'Buong 1-taon na shop & academy bench license',
      'Zero internet required kapag na-activate',
      'Direct owner support & fleet deployment ready',
    ],
    featuresEnglish: [
      'Full 1-year shop & academy bench license',
      'Zero internet required once activated',
      'Direct owner support & fleet deployment ready',
    ],
  },
];

export const SubscriptionPricingModal: React.FC<SubscriptionPricingModalProps> = ({
  isOpen,
  onClose,
  lang,
  onLicenseActivated,
}) => {
  const qrConfig = usePaymentQrConfig();
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>(PLAN_TIERS[1]);
  const [activationPin, setActivationPin] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);
  const [activationFeedback, setActivationFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleCopyAccountNumber = async () => {
    try {
      await navigator.clipboard.writeText(qrConfig.accountNumber);
      setCopiedNotice(lang === 'TL' ? 'Nakopya ang GCash / Maya Number!' : 'GCash / Maya number copied!');
      window.setTimeout(() => setCopiedNotice(null), 2400);
    } catch {
      setCopiedNotice(qrConfig.accountNumber);
    }
  };

  const handleDownloadQrImage = () => {
    if (!qrConfig.qrImageDataUrl) return;
    const link = document.createElement('a');
    link.href = qrConfig.qrImageDataUrl;
    link.download = 'AutoElectric_Lab_Pro_GCash_Maya_QR.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleActivatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationPin.trim()) return;
    setIsActivating(true);
    setActivationFeedback(null);
    try {
      const res = await activateOfflineLicenseCode({
        activationCode: activationPin.trim(),
      });
      if (res.ok) {
        setActivationFeedback({
          ok: true,
          message:
            lang === 'TL'
              ? `Activated na ang PRO License! (${res.statusView.daysRemaining} araw ang natitira).`
              : `PRO License activated! (${res.statusView.daysRemaining} days remaining).`,
        });
        setActivationPin('');
        onLicenseActivated?.(res.statusView);
      } else {
        setActivationFeedback({
          ok: false,
          message: res.error || res.statusView.messageEnglish,
        });
      }
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div
      data-testid="subscription-pricing-modal"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="In-App E-Wallet QR Payment and Offline Subscription PIN Activation"
    >
      <div className="w-full max-w-4xl max-h-[92dvh] rounded-xl border border-emerald-500/45 bg-[#070E1B] shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B1528] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg border border-emerald-500/50 bg-emerald-950/60 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <h2 className="font-hud text-sm sm:text-base font-bold text-slate-100">
                {lang === 'TL'
                  ? 'Upgrade sa PRO — GCash / Maya QR & Offline PIN'
                  : 'Upgrade to PRO — GCash / Maya QR & Offline PIN'}
              </h2>
              <p className="font-mono text-[10.5px] text-slate-400">
                ECDSA P-256 Offline-Verifiable License · Single-Device Vault Binding · Anti-Clock Guard
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
            aria-label="Close Subscription Pricing Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* 3-Tier Plan Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PLAN_TIERS.map((plan) => {
              const selected = selectedPlan.id === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlan(plan)}
                  className={`text-left rounded-xl border p-3.5 space-y-2 transition-colors cursor-pointer ${
                    selected
                      ? 'border-emerald-400 bg-emerald-950/35'
                      : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-hud text-xs font-bold text-slate-100">{plan.name}</span>
                    {plan.badge && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/50 font-mono text-[9px] font-bold text-emerald-200">
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-sm font-bold text-emerald-300 tabular-nums">
                    {plan.priceLabel}
                  </div>
                  <ul className="space-y-1 text-[11px] text-slate-300">
                    {(lang === 'TL' ? plan.featuresTaglish : plan.featuresEnglish).map((f) => (
                      <li key={f} className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          {/* E-Wallet QR Frame + Instant PIN Activation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* High-Contrast GCash / Maya QR Checkout Card */}
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-hud text-xs font-bold text-cyan-200">
                  <QrCode className="w-4 h-4 text-cyan-400" />
                  Official {qrConfig.providerLabel} QR Checkout
                </span>
                <span className="font-mono text-[10px] text-emerald-300 font-semibold">
                  {selectedPlan.name}
                </span>
              </div>

              {/* Clean White Quiet-Zone Border for Dark-Mode Scannability */}
              <div className="flex justify-center">
                <div className="bg-white p-3.5 rounded-xl border-4 border-white shadow-lg inline-flex flex-col items-center">
                  {qrConfig.qrImageDataUrl ? (
                    <img
                      src={qrConfig.qrImageDataUrl}
                      alt="Official GCash or Maya Payment QR Code"
                      className="w-48 h-48 object-contain"
                    />
                  ) : (
                    <div className="w-48 h-48 flex flex-col items-center justify-center text-center text-slate-800 px-3 gap-2 border-2 border-dashed border-slate-300 rounded-lg">
                      <QrCode className="w-10 h-10 text-slate-500" />
                      <span className="font-mono text-[11px] font-bold">
                        QR Not Uploaded Yet
                      </span>
                      <span className="text-[10px] text-slate-600">
                        Owner can upload GCash / Maya QR inside Admin Billing Manager.
                      </span>
                    </div>
                  )}
                  <span className="mt-2 font-mono text-[10px] font-bold text-slate-800">
                    {qrConfig.accountName}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/90 p-2.5 font-mono text-[11px] space-y-1">
                <div className="text-slate-400">Account Name: <strong className="text-slate-100">{qrConfig.accountName}</strong></div>
                <div className="text-slate-400">GCash / Maya No.: <strong className="text-cyan-300">{qrConfig.accountNumber}</strong></div>
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed">
                {qrConfig.instructionsTaglish}
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDownloadQrImage}
                  disabled={!qrConfig.qrImageDataUrl}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-cyan-500/60 bg-cyan-950/60 hover:bg-cyan-900/70 disabled:opacity-45 font-mono text-[11px] font-semibold text-cyan-200 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save QR Code</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyAccountNumber}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-emerald-500/60 bg-emerald-950/60 hover:bg-emerald-900/70 font-mono text-[11px] font-semibold text-emerald-200 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy GCash/Maya Number</span>
                </button>
              </div>
              {copiedNotice && (
                <div className="font-mono text-[10.5px] text-emerald-300">{copiedNotice}</div>
              )}
            </div>

            {/* Instant Offline PIN Activation Box */}
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-4 flex flex-col justify-between space-y-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <h3 className="font-hud text-xs font-bold text-slate-100">
                    Instant Offline PIN Activation
                  </h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {lang === 'TL'
                    ? 'I-paste dito ang signed PRO License Key (AELP-PRO-XXXX-2026...) na galing sa Owner/Admin. Verified offline gamit ang Web Crypto ECDSA P-256.'
                    : 'Paste your signed PRO License Key (AELP-PRO-XXXX-2026...) issued by the Owner/Admin. Verified locally offline using Web Crypto ECDSA P-256.'}
                </p>

                <form onSubmit={handleActivatePin} className="space-y-3">
                  <textarea
                    rows={4}
                    value={activationPin}
                    onChange={(e) => setActivationPin(e.target.value)}
                    placeholder="AELP-PRO-XXXX-2026.<payload>.<signature>"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 font-mono text-[11px] text-slate-100 placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isActivating || !activationPin.trim()}
                    className="w-full py-2.5 rounded-md border border-emerald-500/75 bg-emerald-600/30 hover:bg-emerald-500/40 disabled:opacity-45 font-mono text-xs font-bold text-emerald-100 inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{isActivating ? 'Verifying ECDSA P-256 Signature...' : 'Activate PRO License Offline'}</span>
                  </button>
                </form>

                {activationFeedback && (
                  <div
                    className={`rounded-lg border p-3 font-mono text-[11px] ${
                      activationFeedback.ok
                        ? 'border-emerald-500/70 bg-emerald-950/50 text-emerald-200'
                        : 'border-rose-500/70 bg-rose-950/50 text-rose-200'
                    }`}
                  >
                    {activationFeedback.message}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 font-mono text-[10px] text-slate-400 space-y-1">
                <div className="text-slate-200 font-semibold">Offline Vault Safeguards</div>
                <div>• Stored in IndexedDB <code className="text-cyan-300">AutoLabPro_LicenseVault</code></div>
                <div>• Single-Device Fingerprint Binding prevents PIN sharing</div>
                <div>• Monotonic Anti-Clock Guard flags manual system clock rollback</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
