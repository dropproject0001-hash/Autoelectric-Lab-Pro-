import React from 'react';
import { ShieldAlert, ShieldCheck, Info, ExternalLink } from 'lucide-react';
import { AutomotiveRecordProvenance } from '../types/provenance';
import {
  getVerificationBadgeMeta,
  REGIONAL_MARKET_LABELS,
} from '../utils/provenanceEngine';

interface ProvenanceBadgeBarProps {
  provenance: AutomotiveRecordProvenance;
  compact?: boolean;
}

const TONE_CLASSES: Record<string, string> = {
  emerald: 'bg-emerald-950/70 border-emerald-700/70 text-emerald-300',
  cyan: 'bg-[#1a222d] border-slate-500/70 text-slate-200',
  amber: 'bg-amber-950/70 border-amber-700/70 text-amber-300',
  rose: 'bg-rose-950/70 border-rose-700/70 text-rose-300',
  slate: 'bg-[#13171f] border-[#2e3644] text-slate-300',
};

export const ProvenanceBadgeBar: React.FC<ProvenanceBadgeBarProps> = ({
  provenance,
  compact = false,
}) => {
  const meta = getVerificationBadgeMeta(provenance.verificationStatus);
  const toneClass = TONE_CLASSES[meta.tone] || TONE_CLASSES.slate;
  const regionsText = provenance.regionalApplicability
    .map((r) => REGIONAL_MARKET_LABELS[r] || r)
    .join(', ');

  return (
    <div className="hw-lcd-well rounded-[2px] p-2.5 flex flex-col gap-1.5 text-[10px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`px-2 py-0.5 rounded-[2px] border font-bold flex items-center gap-1 ${toneClass}`}
            title={meta.description}
          >
            {meta.canAuthorizeLiveVoltage ? (
              <ShieldCheck className="w-3 h-3 shrink-0" />
            ) : (
              <ShieldAlert className="w-3 h-3 shrink-0" />
            )}
            <span>{meta.shortLabel}</span>
          </span>
          <span className="font-semibold text-slate-200">{provenance.sourceName}</span>
          <span className="text-slate-500">· {provenance.publicationOrRevision}</span>
        </div>
        <span className="text-slate-500">
          Retrieved: {new Date(provenance.dateRetrieved).toLocaleString()}
        </span>
      </div>

      {!compact && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-1 text-[10px] text-slate-400 font-sans">
          <div>
            <strong className="text-slate-300">Applicable Vehicle:</strong>{' '}
            {provenance.manufacturer} — {provenance.applicableVehicle}
          </div>
          <div>
            <strong className="text-slate-300">Regions:</strong> {regionsText}
          </div>
          <div className="truncate">
            <strong className="text-slate-300">Reference:</strong>{' '}
            {provenance.sourceUrlOrRef.startsWith('http') ? (
              <a
                href={provenance.sourceUrlOrRef}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-300 hover:underline inline-flex items-center gap-0.5"
              >
                <span>{provenance.sourceUrlOrRef}</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            ) : (
              <span>{provenance.sourceUrlOrRef}</span>
            )}
          </div>
          {provenance.engineCode && (
            <div>
              <strong className="text-slate-300">Engine/Controller:</strong> {provenance.engineCode}
            </div>
          )}
          {provenance.ecuPartNumber && (
            <div>
              <strong className="text-slate-300">ECU Part #:</strong> {provenance.ecuPartNumber}
            </div>
          )}
          {provenance.licenseNotice && (
            <div className="text-amber-300/90">
              <strong>License:</strong> {provenance.licenseNotice}
            </div>
          )}
        </div>
      )}

      <div className="flex items-start gap-1.5 text-[10px] text-slate-400 font-sans">
        <Info className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
        <span>{provenance.confidenceOrUncertainty}</span>
      </div>
    </div>
  );
};
