import React, { useEffect, useState } from 'react';
import { Crown, ShieldAlert, Sparkles } from 'lucide-react';
import {
  subscribeOfflineLicenseStatus,
  type LicenseStatusView,
} from '../../services/billing/licenseVerificationService';
import type { BilingualLang } from '../../types/aiAssistant';

interface LicenseStatusBadgeProps {
  lang: BilingualLang;
  onClick: () => void;
}

export const LicenseStatusBadge: React.FC<LicenseStatusBadgeProps> = ({
  lang,
  onClick,
}) => {
  const [statusView, setStatusView] = useState<LicenseStatusView | null>(null);

  useEffect(() => {
    return subscribeOfflineLicenseStatus(setStatusView);
  }, []);

  const status = statusView?.status || 'FREE_TRIAL';

  if (status === 'CLOCK_TAMPER_DETECTED') {
    return (
      <button
        type="button"
        data-testid="license-status-badge"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] border border-rose-500/75 bg-rose-950/75 text-rose-200 font-mono text-[10.5px] font-bold cursor-pointer"
        title={statusView?.messageEnglish}
      >
        <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
        <span>CLOCK TAMPER LOCKED</span>
      </button>
    );
  }

  if (status === 'PRO_ACTIVE' && statusView) {
    return (
      <button
        type="button"
        data-testid="license-status-badge"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] border border-emerald-500/65 bg-emerald-950/60 text-emerald-200 hover:bg-emerald-900/60 font-mono text-[10.5px] font-semibold cursor-pointer"
        title={statusView.licenseKey || 'Active Offline PRO License'}
      >
        <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
        <span>
          {lang === 'TL'
            ? `PRO LICENSE · ${statusView.daysRemaining} Araw ang Natitira`
            : `PRO LICENSE · ${statusView.daysRemaining} Days Left`}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid="license-status-badge"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] border border-cyan-500/55 bg-[#0A1120] hover:bg-cyan-950/70 text-[#00E5FF] font-mono text-[10.5px] font-semibold cursor-pointer"
    >
      <Sparkles className="w-3.5 h-3.5 shrink-0" />
      <span>{lang === 'TL' ? 'FREE / TRIAL · Upgrade' : 'FREE / TRIAL · Upgrade'}</span>
    </button>
  );
};
