import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Lock,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useTrialAccess } from '../../context/TrialAccessContext';
import {
  verifyAcademyLabReport,
  type AcademyVerificationOutcome,
} from '../../utils/academy/labCryptoVerifier';
import type { BilingualLang } from '../../types/aiAssistant';

interface InstructorVerifierViewProps {
  isOpen: boolean;
  onClose: () => void;
  lang: BilingualLang;
}

export const InstructorVerifierView: React.FC<InstructorVerifierViewProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const { isAdminUnlocked, openAccessModal } = useTrialAccess();
  const [activeTab, setActiveTab] = useState<'PASTE' | 'CAMERA'>('PASTE');
  const [rawInput, setRawInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [outcome, setOutcome] = useState<AcademyVerificationOutcome | null>(null);
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen || activeTab !== 'CAMERA') {
      stopCamera();
      return;
    }

    let cancelled = false;
    const startCamera = async () => {
      setCameraNotice(null);
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraNotice('Camera access is unavailable in this browser. Switch to Paste Hash / Payload tab.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const win = window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (el: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
          };
        };
        if (!win.BarcodeDetector) {
          setCameraNotice(
            'Camera preview active, but native BarcodeDetector is unavailable in this browser. Copy/paste the QR token or 64-character SHA-256 hash into the Paste tab.'
          );
          return;
        }
        const detector = new win.BarcodeDetector({ formats: ['qr_code'] });
        const scanFrame = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const first = codes.find((c) => c.rawValue)?.rawValue;
            if (first) {
              setRawInput(first);
              setActiveTab('PASTE');
              const res = await verifyAcademyLabReport(first);
              setOutcome(res);
              return;
            }
          } catch {
            // Keep scanning while active
          }
          if (!cancelled) {
            window.setTimeout(() => void scanFrame(), 450);
          }
        };
        void scanFrame();
      } catch {
        setCameraNotice('Camera permission denied or unavailable. Use Paste Hash / Payload tab.');
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, activeTab, stopCamera]);

  if (!isOpen) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    try {
      const res = await verifyAcademyLabReport(rawInput);
      setOutcome(res);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      data-testid="instructor-verifier-view"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Instructor QR & SHA-256 Verification Console"
    >
      <div className="w-full max-w-xl rounded-xl border border-amber-500/50 bg-[#070E1B] shadow-2xl overflow-hidden text-slate-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B1528]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <h2 className="font-hud text-sm font-bold">
              Instructor QR &amp; SHA-256 PDF Verifier
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
            aria-label="Close Instructor Verifier"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isAdminUnlocked ? (
          <div className="p-6 text-center space-y-3">
            <div className="mx-auto w-11 h-11 rounded-full border border-amber-500/60 bg-amber-950/50 flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-300" />
            </div>
            <h3 className="font-hud text-sm font-bold text-amber-200">
              Master Admin PIN Required
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Instructor cryptographic verification is locked behind the Master Admin PIN to preserve institutional integrity.
            </p>
            <button
              type="button"
              onClick={() => openAccessModal({ tab: 'ADMIN_GEN' })}
              className="hw-btn hw-btn-amber px-4 py-2 rounded-md font-mono text-xs font-semibold cursor-pointer"
            >
              Unlock with Master Admin PIN
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3 text-xs">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('PASTE')}
                className={`flex-1 py-1.5 rounded-md border font-mono text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'PASTE'
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                }`}
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>Paste Hash / QR Payload</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('CAMERA')}
                className={`flex-1 py-1.5 rounded-md border font-mono text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'CAMERA'
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Live Camera QR Scanner</span>
              </button>
            </div>

            {activeTab === 'CAMERA' ? (
              <div className="space-y-2">
                <div className="rounded-lg overflow-hidden border border-slate-700 bg-black aspect-video flex items-center justify-center">
                  <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                </div>
                {cameraNotice && (
                  <p className="text-[11px] font-mono text-amber-300">{cameraNotice}</p>
                )}
              </div>
            ) : (
              <form onSubmit={handleVerify} className="space-y-2.5">
                <textarea
                  rows={3}
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder="Paste AELP1|... QR token or 64-character SHA-256 hex digest from student exam PDF"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 p-2.5 font-mono text-[11px] text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isVerifying || !rawInput.trim()}
                  className="w-full py-2 rounded-md border border-cyan-500/70 bg-cyan-600/30 hover:bg-cyan-500/40 disabled:opacity-50 font-mono text-xs font-semibold text-cyan-100 cursor-pointer"
                >
                  {isVerifying ? 'Recomputing SHA-256 Digest...' : 'Verify Session Authenticity'}
                </button>
              </form>
            )}

            {/* Tamper-Proof Verification Result Card */}
            {outcome && (
              <div
                data-verification-badge={outcome.badge}
                className={`rounded-lg border p-3.5 space-y-2 ${
                  outcome.valid
                    ? 'border-emerald-500/70 bg-emerald-950/40'
                    : 'border-rose-500/75 bg-rose-950/45'
                }`}
              >
                <div className="flex items-center gap-2 font-hud text-xs font-bold">
                  {outcome.valid ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-emerald-200">VERIFIED GENUINE SESSION</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="text-rose-200">TAMPERED / INVALID SIGNATURE</span>
                    </>
                  )}
                </div>

                <p className="text-[11px] text-slate-200">
                  {lang === 'TL' ? outcome.messageTaglish : outcome.messageEnglish}
                </p>

                {outcome.payload && (
                  <div className="rounded border border-slate-800 bg-slate-950/80 p-2.5 font-mono text-[10.5px] space-y-1 text-slate-300">
                    <div>
                      Student:{' '}
                      <strong className="text-slate-100">
                        {outcome.payload.student.firstName} {outcome.payload.student.lastName} (
                        {outcome.payload.student.studentAccountCode})
                      </strong>
                    </div>
                    <div>
                      Module:{' '}
                      <strong className="text-cyan-200">
                        {outcome.payload.module.exerciseCode} — {outcome.payload.module.titleTaglish}
                      </strong>
                    </div>
                    <div>
                      PSU: {outcome.payload.benchConditions.psuVoltageSetting}V · Steps:{' '}
                      {outcome.payload.stepResults.length} · Generated:{' '}
                      {outcome.payload.generatedAtIso}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
