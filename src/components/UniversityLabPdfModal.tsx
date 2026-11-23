import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileDown,
  GraduationCap,
  Lock,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useTrialAccess } from '../context/TrialAccessContext';
import {
  getUniversityTierMeta,
  type CapturedLabStepEvidence,
  type UniversityLabModule,
} from '../data/universityLabCurriculum';
import {
  generateAndDownloadUniversityLabPdf,
  validateStudentForm,
  verifyOfflineLabReportToken,
  type InstitutionalStudentInfo,
  type OfflineVerificationResult,
  type SignedLabReportEnvelope,
} from '../services/universityLabPdfService';
import type {
  DiagnosticTroubleCode,
  InjectedFault,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';

export interface UniversityLabPdfModalProps {
  isOpen: boolean;
  initialTab?: 'EXPORT' | 'VERIFY';
  onClose: () => void;
  activeModule: UniversityLabModule | null;
  capturedSteps: readonly CapturedLabStepEvidence[];
  powerSupply: PowerSupplyState;
  supplyCurrentDrawAmps: number;
  faults: readonly InjectedFault[];
  wires: readonly WireConnection[];
  activeDTCs: readonly DiagnosticTroubleCode[];
  rpm: number;
  ckpSignalLost: boolean;
  tpsVoltage: number;
}

const DEFAULT_STUDENT_INFO: InstitutionalStudentInfo = {
  firstName: '',
  lastName: '',
  studentAccountCode: '',
  universityCampus: 'Technological University of the Philippines',
  labTerminal: 'Station #01 - Bench Bay A',
  studentConclusion: '',
};

export const UniversityLabPdfModal: React.FC<UniversityLabPdfModalProps> = ({
  isOpen,
  initialTab = 'EXPORT',
  onClose,
  activeModule,
  capturedSteps,
  powerSupply,
  supplyCurrentDrawAmps,
  faults,
  wires,
  activeDTCs,
  rpm,
  ckpSignalLost,
  tpsVoltage,
}) => {
  const { accessMode, trialRecord, canUseExports, openAccessModal } = useTrialAccess();
  const [activeTab, setActiveTab] = useState<'EXPORT' | 'VERIFY'>(initialTab);
  const [studentInfo, setStudentInfo] = useState<InstitutionalStudentInfo>(DEFAULT_STUDENT_INFO);
  const [formError, setFormError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<{
    filename: string;
    envelope: SignedLabReportEnvelope;
  } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Offline Instructor Verifier state
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<OfflineVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [printedNameCheck, setPrintedNameCheck] = useState('');

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setFormError(null);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Non-secret bound session identifier (never exposes plaintext PINs)
  const boundSessionRef = useMemo(() => {
    if (accessMode === 'ADMIN') return 'MASTER-ADMIN-WORKSTATION';
    if (trialRecord?.trialId) return `PIN-REF-${trialRecord.trialId.slice(0, 8).toUpperCase()}`;
    return 'OFFLINE-PIN-WORKSTATION';
  }, [accessMode, trialRecord]);

  const formValidation = useMemo(() => validateStudentForm(studentInfo), [studentInfo]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleGeneratePdf = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!canUseExports) {
      openAccessModal({
        tab: 'TRIAL_PIN',
        notice:
          'Naka-lock ang Verified PDF Export. Maglagay ng aktibong 8-digit Trial PIN o Master Admin PIN upang ma-download ang opisyal na lab report.',
      });
      return;
    }

    const validation = validateStudentForm(studentInfo);
    if (!validation.valid) {
      setFormError(`Pakikumpleto ang mga mandatory fields: ${validation.missingFields.join(', ')}.`);
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateAndDownloadUniversityLabPdf({
        student: studentInfo,
        boundSessionRef,
        module: activeModule,
        powerSupply,
        supplyCurrentDrawAmps,
        faults,
        wires,
        activeDTCs,
        capturedSteps,
        rpm,
        ckpSignalLost,
        tpsVoltage,
      });
      setGeneratedResult(result);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? `Nabigo ang paggawa ng PDF: ${err.message}`
          : 'Hindi nabuo ang A4 PDF report. Subukan muli.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyQrToken = async () => {
    if (!generatedResult) return;
    try {
      await navigator.clipboard.writeText(generatedResult.envelope.qrToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      setFormError('Hindi makopya nang awtomatiko; pindutin ang token box upang kopyahin nang mano-mano.');
    }
  };

  const handleVerifyOfflineToken = async (overrideToken?: string) => {
    const tokenToTest = overrideToken ?? verifyInput;
    setIsVerifying(true);
    try {
      const result = await verifyOfflineLabReportToken(tokenToTest);
      setVerifyResult(result);
    } finally {
      setIsVerifying(false);
    }
  };

  const tierLabel = activeModule
    ? getUniversityTierMeta(activeModule.tier).titleTaglish
    : 'General ECU Bench Practical';

  const printedNameMismatch =
    verifyResult?.valid &&
    verifyResult.payload &&
    printedNameCheck.trim().length > 0 &&
    `${verifyResult.payload.student.firstName} ${verifyResult.payload.student.lastName}`
      .toLowerCase()
      .trim() !== printedNameCheck.toLowerCase().trim();

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="university-pdf-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#203653] bg-[#0a1220] text-[#eaf3ff] shadow-2xl"
      >
        {/* Modal Header */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#203653] bg-[#0e192a] px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-amber-300">
              <GraduationCap className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="font-semibold">University Automotive Lab · Offline Cryptographic PDF</span>
            </div>
            <h2 id="university-pdf-modal-title" className="mt-0.5 truncate text-base font-semibold text-white">
              {activeTab === 'EXPORT'
                ? 'Export Verified Lab Bench Report (A4 PDF)'
                : 'Offline Instructor Sheet Verifier (SHA-256 Anti-Tamper Check)'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Isara ang Verification Modal"
            className="hw-btn inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {/* Segmented Mode Tabs */}
        <div className="flex shrink-0 items-center gap-2 border-b border-[#203653] bg-[#0b1525] px-5 py-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('EXPORT')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'EXPORT'
                ? 'border-amber-400/70 bg-amber-950/60 text-amber-100'
                : 'border-[#203653] bg-transparent text-slate-300 hover:text-white'
            }`}
          >
            <FileDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>1. Export Verified A4 PDF</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('VERIFY')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'VERIFY'
                ? 'border-cyan-400/70 bg-cyan-950/60 text-cyan-100'
                : 'border-[#203653] bg-transparent text-slate-300 hover:text-white'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>2. Offline Instructor Verifier</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {activeTab === 'EXPORT' ? (
            <form onSubmit={handleGeneratePdf} className="space-y-4">
              {/* Session & Telemetry Summary Strip (Zero-Pill Unboxed Metadata) */}
              <div className="rounded-lg border border-[#203653] bg-[#0e192a] p-3.5 text-xs text-slate-300 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums">
                  <span className="font-semibold text-white">{activeModule?.exerciseCode ?? 'BENCH-PRACTICAL'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-300">{tierLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-cyan-300">
                    {capturedSteps.length} Step Evidence Locked
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    PSU: {powerSupply.isOutputEnabled ? `${powerSupply.voltageSetting.toFixed(2)}V ON` : 'OFF'} ({supplyCurrentDrawAmps.toFixed(2)}A)
                  </span>
                </div>
                <div className="font-mono text-[11px] text-slate-400">
                  Bound Session Ref: <span className="text-emerald-300">{boundSessionRef}</span> · Offline SHA-256 Digest + Live Scope Snapshot
                </div>
              </div>

              {capturedSteps.length === 0 && activeModule && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/45 bg-amber-950/35 px-3.5 py-2.5 text-xs text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                  <span>
                    Paalala: Wala ka pang naka-capture na step reading sa <strong>{activeModule.exerciseCode}</strong>. Maaari ka pa ring mag-export, ngunit mas mabuting i-click muna ang <strong>Capture Reading</strong> sa bawat step para mailagay ang totoong MNA sukat sa exam sheet.
                  </span>
                </div>
              )}

              {/* Mandatory Student & Institutional Form Fields */}
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div>
                  <label htmlFor="univ-first-name" className="block text-xs font-medium text-slate-300">
                    Pangalan (First Name) *
                  </label>
                  <input
                    id="univ-first-name"
                    type="text"
                    required
                    maxLength={60}
                    placeholder="hal. Juan"
                    value={studentInfo.firstName}
                    onChange={(e) => setStudentInfo((p) => ({ ...p, firstName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#2c4260] bg-[#070d17] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="univ-last-name" className="block text-xs font-medium text-slate-300">
                    Apelyido (Last Name) *
                  </label>
                  <input
                    id="univ-last-name"
                    type="text"
                    required
                    maxLength={60}
                    placeholder="hal. Dela Cruz"
                    value={studentInfo.lastName}
                    onChange={(e) => setStudentInfo((p) => ({ ...p, lastName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#2c4260] bg-[#070d17] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="univ-account-code" className="block text-xs font-medium text-slate-300">
                    Student / Account Code *
                  </label>
                  <input
                    id="univ-account-code"
                    type="text"
                    required
                    maxLength={48}
                    placeholder="hal. TUP-AUTO-2026-981"
                    value={studentInfo.studentAccountCode}
                    onChange={(e) => setStudentInfo((p) => ({ ...p, studentAccountCode: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#2c4260] bg-[#070d17] px-3 py-2 font-mono text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="univ-terminal" className="block text-xs font-medium text-slate-300">
                    Lab Terminal / Station *
                  </label>
                  <input
                    id="univ-terminal"
                    type="text"
                    required
                    maxLength={80}
                    placeholder="hal. Station #04 - Bench Bay A"
                    value={studentInfo.labTerminal}
                    onChange={(e) => setStudentInfo((p) => ({ ...p, labTerminal: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#2c4260] bg-[#070d17] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="univ-campus" className="block text-xs font-medium text-slate-300">
                    University / Technical Institute &amp; Campus *
                  </label>
                  <input
                    id="univ-campus"
                    type="text"
                    required
                    maxLength={100}
                    placeholder="hal. Technological University of the Philippines — Manila"
                    value={studentInfo.universityCampus}
                    onChange={(e) => setStudentInfo((p) => ({ ...p, universityCampus: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#2c4260] bg-[#070d17] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="univ-conclusion" className="block text-xs font-medium text-slate-300">
                    Konklusyon at Repair Action ng Estudyante *
                  </label>
                  <textarea
                    id="univ-conclusion"
                    required
                    rows={3}
                    maxLength={500}
                    placeholder="Isulat ang natuklasang root cause (hal. Putol ang signal wire sa Pin 7 TPS_SIG kaya 0.00V ang sukat habang 5.00V ang VREF. Inayos ang harness continuity at naibalik ang 1.30V idle signal.)"
                    value={studentInfo.studentConclusion}
                    onChange={(e) => setStudentInfo((p) => ({ ...p, studentConclusion: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#2c4260] bg-[#070d17] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              {formError && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/50 bg-rose-950/50 px-3.5 py-2.5 text-xs text-rose-200">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-[11px] text-slate-400">
                  Offline SHA-256 stamp · Walang internet o server na kailangan
                </span>
                <button
                  type="submit"
                  disabled={isGenerating || !formValidation.valid}
                  className={`inline-flex min-h-[42px] items-center gap-2 rounded-lg border px-4 py-2 font-mono text-xs font-bold whitespace-nowrap transition-colors ${
                    isGenerating || !formValidation.valid
                      ? 'border-slate-700 bg-slate-900 text-slate-500 cursor-not-allowed'
                      : 'border-amber-400/70 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 cursor-pointer'
                  }`}
                >
                  <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {isGenerating
                      ? 'Binubuo ang Verified A4 PDF...'
                      : 'Generate Cryptographically Verified PDF Report'}
                  </span>
                </button>
              </div>

              {/* Generated PDF Cryptographic Confirmation Panel */}
              {generatedResult && (
                <div className="rounded-lg border border-emerald-500/45 bg-[#082119]/60 p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Na-download na ang Verified A4 PDF: {generatedResult.filename}</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-200 break-all tabular-nums">
                    <span className="text-slate-400">SHA-256 Hash: </span>
                    {generatedResult.envelope.sha256Hash}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyQrToken}
                      className="hw-btn inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[11px] text-emerald-200 hover:text-white cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{copiedToken ? 'Nakopya na ang QR Token!' : 'Copy QR Verification Token'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVerifyInput(generatedResult.envelope.qrToken);
                        setActiveTab('VERIFY');
                        void handleVerifyOfflineToken(generatedResult.envelope.qrToken);
                      }}
                      className="hw-btn inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[11px] text-cyan-200 hover:text-white cursor-pointer"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>I-Test sa Offline Verifier</span>
                    </button>
                  </div>
                </div>
              )}
            </form>
          ) : (
            /* TAB 2: OFFLINE INSTRUCTOR SHEET VERIFIER */
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-slate-300">
                I-scan ang QR code sa papel o PDF ng estudyante gamit ang anumang offline QR scanner at i-paste dito ang lumabas na token (<span className="font-mono text-cyan-300">AELP1|...</span>). Awtomatikong muling kukumpyutin ng app ang SHA-256 cryptographic hash offline upang matuklasan kung binago ang pangalan, oras, o score.
              </p>

              <div className="space-y-2">
                <label htmlFor="offline-qr-token" className="block text-xs font-medium text-slate-300">
                  QR Code Verification Token (Offline SHA-256 Payload)
                </label>
                <textarea
                  id="offline-qr-token"
                  rows={4}
                  placeholder="I-paste dito ang AELP1|... string mula sa na-scan na QR code..."
                  value={verifyInput}
                  onChange={(e) => setVerifyInput(e.target.value)}
                  className="w-full rounded-lg border border-[#2c4260] bg-[#070d17] p-3 font-mono text-xs text-cyan-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input
                    type="text"
                    placeholder="Optional: I-type ang pangalan sa papel upang ikumpara (hal. Juan Dela Cruz)"
                    value={printedNameCheck}
                    onChange={(e) => setPrintedNameCheck(e.target.value)}
                    className="min-w-[240px] flex-1 rounded-lg border border-[#2c4260] bg-[#070d17] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={isVerifying || !verifyInput.trim()}
                    onClick={() => void handleVerifyOfflineToken()}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-cyan-400/70 bg-cyan-500/20 px-4 py-2 font-mono text-xs font-bold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{isVerifying ? 'Bine-verify...' : 'Verify SHA-256 Offline'}</span>
                  </button>
                </div>
              </div>

              {verifyResult && (
                <div
                  className={`rounded-lg border p-4 space-y-3 ${
                    verifyResult.status === 'GENUINE' && !printedNameMismatch
                      ? 'border-emerald-500/50 bg-[#082119]/60'
                      : 'border-rose-500/60 bg-[#290c16]/65'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {verifyResult.status === 'GENUINE' && !printedNameMismatch ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" aria-hidden="true" />
                    )}
                    <div className="space-y-1">
                      <div
                        className={`font-mono text-xs font-bold uppercase ${
                          verifyResult.status === 'GENUINE' && !printedNameMismatch
                            ? 'text-emerald-300'
                            : 'text-rose-300'
                        }`}
                      >
                        {printedNameMismatch
                          ? 'TAMPER WARNING — HINDI TUGMA ANG PANGALAN SA PAPEL AT QR HASH'
                          : verifyResult.status === 'GENUINE'
                            ? 'GENUINE — OFFLINE SHA-256 INTEGRITY VERIFIED'
                            : verifyResult.status === 'TAMPERED'
                              ? 'TAMPERED — SHA-256 HASH MISMATCH DETECTED'
                              : 'INVALID VERIFICATION TOKEN'}
                      </div>
                      <p className="text-xs text-slate-200">{verifyResult.reasonTaglish}</p>
                    </div>
                  </div>

                  {verifyResult.payload && (
                    <div className="space-y-2 border-t border-white/10 pt-3 text-xs">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 font-mono text-[11px] tabular-nums">
                        <div>
                          <span className="text-slate-400">Estudyante: </span>
                          <span className="font-semibold text-white">
                            {verifyResult.payload.student.firstName} {verifyResult.payload.student.lastName}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Account / Bound Ref: </span>
                          <span className="text-emerald-300">
                            {verifyResult.payload.student.studentAccountCode} · {verifyResult.payload.student.boundSessionRef}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Campus / Terminal: </span>
                          <span className="text-slate-200">
                            {verifyResult.payload.student.universityCampus} ({verifyResult.payload.student.labTerminal})
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Module / Petsa: </span>
                          <span className="text-amber-300">
                            {verifyResult.payload.module.exerciseCode} ·{' '}
                            {new Date(verifyResult.payload.generatedAtIso).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {verifyResult.payload.stepResults.length > 0 && (
                        <div className="rounded-md border border-white/10 bg-[#070d17] p-2.5 font-mono text-[11px] tabular-nums space-y-1">
                          <div className="text-slate-400 font-semibold">Verified Step Readings:</div>
                          {verifyResult.payload.stepResults.map((s) => (
                            <div key={`${s.stepNumber}-${s.title}`} className="flex flex-wrap justify-between gap-2">
                              <span className="text-slate-200">
                                #{s.stepNumber} {s.title}
                              </span>
                              <span className="text-cyan-300">
                                {s.measured} · {s.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="font-mono text-[10.5px] text-slate-400 break-all">
                        Recomputed SHA-256: <span className="text-slate-200">{verifyResult.computedHash}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
