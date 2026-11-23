import React from 'react';
import { X, Globe } from 'lucide-react';
import { GroundedSearchPanel } from './GroundedSearchPanel';

interface GroundedSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
  initialDtc?: string;
  initialEcu?: string;
}

export const GroundedSearchModal: React.FC<GroundedSearchModalProps> = ({
  isOpen,
  onClose,
  initialQuery,
  initialDtc,
  initialEcu,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 animate-in fade-in duration-150">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col hud-panel rounded-[3px] border-[#3c4554] shadow-2xl overflow-hidden font-mono text-slate-100">
        {/* Top Header */}
        <div className="flex items-center justify-between px-4 py-3 hud-header">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[2px] hw-lcd-well border-[#3c4554] flex items-center justify-center">
              <Globe className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-hud font-bold text-slate-100 tracking-wide uppercase">
                Live Google Search Grounding · ECU Technical Bulletins & Pinouts
              </h2>
              <p className="text-[10px] text-slate-400 font-sans">
                Real-time web intelligence grounded via Gemini 4 Hydrogen and Google Search
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="hw-btn p-1.5 rounded-[2px] text-slate-400 hover:text-white transition"
            title="Close Search Modal (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body with GroundedSearchPanel */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-[#0c0e12]">
          <GroundedSearchPanel
            initialQuery={initialQuery}
            initialDtc={initialDtc}
            initialEcu={initialEcu}
            className="border-[#2b313c]"
          />
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2 bg-[#111419] border-t border-[#2b313c] flex items-center justify-between gap-2 text-[11px] text-slate-400 font-sans">
          <span>Bench Verification: Always confirm wiring pinouts with physical multimeter measurements before powering up.</span>
          <button
            onClick={onClose}
            className="hw-btn px-3 py-1 text-slate-200 rounded-[2px] text-xs font-mono font-medium transition shrink-0"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
