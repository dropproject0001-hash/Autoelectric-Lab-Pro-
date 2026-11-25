/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useState } from 'react';
import { CheckCircle2, FileDown, ShieldCheck, X } from 'lucide-react';
import { generateAcademyLabPdf } from '../../utils/academy/generateLabPdf';
import type {
  CapturedLabStepEvidence,
  UniversityLabModule,
} from '../../data/universityLabCurriculum';
import type {
  DiagnosticTroubleCode,
  InjectedFault,
  PowerSupplyState,
  WireConnection,
} from '../../types/ecu';

interface VerifiedPdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  module: UniversityLabModule;
  capturedEvidence: Record<string, CapturedLabStepEvidence>;
  powerSupply: PowerSupplyState;
  peakCurrentDrawAmps: number;
  activeDTCs: DiagnosticTroubleCode[];
  faults: InjectedFault[];
  wires: WireConnection[];
  defaultConclusion?: string;
}

export const VerifiedPdfExportModal: React.FC<VerifiedPdfExportModalProps> = ({
  isOpen,
  onClose,
  module,
  capturedEvidence,
  powerSupply,
  peakCurrentDrawAmps,
  activeDTCs,
  faults,
  wires,
  defaultConclusion = '',
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [studentAccountCode, setStudentAccountCode] = useState('');
  const [universityCampus, setUniversityCampus] = useState('');
  const [labTerminal, setLabTerminal] = useState('BAY-01');
  const [studentConclusion, setStudentConclusion] = useState(defaultConclusion);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exportedHash, setExportedHash] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !studentAccountCode.trim() ||
      !universityCampus.trim() ||
      !labTerminal.trim()
    ) {
      setErrorMsg('Student Name, Account Code, Campus, and Terminal Bay are all required.');
      return;
    }

    setIsExporting(true);
    try {
      const res = await generateAcademyLabPdf({
        student: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          studentAccountCode: studentAccountCode.trim(),
          universityCampus: universityCampus.trim(),
          labTerminal: labTerminal.trim(),
          studentConclusion:
            studentConclusion.trim() || 'Completed verified live MNA bench lab verification.',
        },
        boundSessionRef: `TERMINAL-${labTerminal.trim().toUpperCase()}`,
        module,
        capturedEvidence,
        powerSupply,
        peakCurrentDrawAmps,
        activeDTCs,
        faults,
        wires,
        download: true,
      });
      setExportedHash(res.envelope.sha256Hash);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF generation failed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      data-testid="verified-pdf-export-modal"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Verified Cryptographic PDF Export"
    >
      <div className="w-full max-w-lg rounded-xl border border-cyan-500/50 bg-[#070E1B] shadow-2xl overflow-hidden text-slate-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B1528]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h2 className="font-hud text-sm font-bold">
              Mandatory Verification · SHA-256 Exam PDF
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
            aria-label="Close PDF Export Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleExport} className="p-4 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2.5">
            <label className="space-y-1">
              <span className="font-mono text-[10px] text-slate-400">First Name *</span>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10px] text-slate-400">Last Name *</span>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="space-y-1">
              <span className="font-mono text-[10px] text-slate-400">Student Account Code *</span>
              <input
                type="text"
                required
                placeholder="e.g. STU-2026-0412"
                value={studentAccountCode}
                onChange={(e) => setStudentAccountCode(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10px] text-slate-400">Terminal Bay *</span>
              <input
                type="text"
                required
                placeholder="e.g. BAY-04"
                value={labTerminal}
                onChange={(e) => setLabTerminal(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </label>
          </div>

          <label className="space-y-1 block">
            <span className="font-mono text-[10px] text-slate-400">Campus / Institute *</span>
            <input
              type="text"
              required
              placeholder="e.g. AutoElectric Technical College — Main Campus"
              value={universityCampus}
              onChange={(e) => setUniversityCampus(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
            />
          </label>

          <label className="space-y-1 block">
            <span className="font-mono text-[10px] text-slate-400">Student Conclusion</span>
            <textarea
              rows={2}
              value={studentConclusion}
              onChange={(e) => setStudentConclusion(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
            />
          </label>

          {errorMsg && (
            <div className="rounded border border-rose-500/60 bg-rose-950/50 px-3 py-2 text-rose-200 font-mono text-[11px]">
              {errorMsg}
            </div>
          )}

          {exportedHash && (
            <div className="rounded border border-emerald-500/60 bg-emerald-950/40 p-2.5 space-y-1 font-mono text-[10.5px] text-emerald-200">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Tamper-Proof A4 PDF Generated &amp; Signed</span>
              </div>
              <div className="break-all text-[10px] text-emerald-300">
                SHA-256: {exportedHash}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isExporting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-cyan-500/70 bg-cyan-600/30 hover:bg-cyan-500/40 disabled:opacity-50 font-mono text-xs font-semibold text-cyan-100 cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            <span>{isExporting ? 'Signing & Generating A4 PDF...' : 'Sign & Download Verified A4 PDF'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
