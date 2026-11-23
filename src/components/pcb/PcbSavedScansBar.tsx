import React from 'react';
import { Trash2 } from 'lucide-react';
import { SavedPcbScan } from '../../services/benchStorageService';

interface PcbSavedScansBarProps {
  savedScans: SavedPcbScan[];
  isSignedIn: boolean;
  onOpenCloudModal?: () => void;
  onLoadScan: (scan: SavedPcbScan) => void;
  onDeleteScan: (scanId: string) => void;
}

export const PcbSavedScansBar: React.FC<PcbSavedScansBarProps> = ({
  savedScans,
  isSignedIn,
  onOpenCloudModal,
  onLoadScan,
  onDeleteScan,
}) => {
  return (
    <div className="bg-[#0e1116] border-b border-[#2b313c] px-3 py-2 flex flex-col gap-2 text-xs font-mono">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider tabular-nums">
          Local Saved PCB Maps ({savedScans.length})
        </span>
        {onOpenCloudModal && (
          <button
            type="button"
            onClick={() => onOpenCloudModal()}
            className="hw-btn text-[11px] px-2.5 py-1 rounded-[2px] font-semibold text-slate-200 cursor-pointer"
          >
            Open Saved Benches
          </button>
        )}
      </div>
      {savedScans.length === 0 ? (
        <div className="text-[11px] text-slate-400 font-sans">
          No saved PCB maps yet. Click &quot;Save&quot; after mapping a PCB to store it locally in IndexedDB.
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {savedScans.map((scan) => (
            <div
              key={scan.id}
              className="min-w-[220px] max-w-[260px] bg-[#171b22] border border-[#2b313c] hover:border-[#444e5e] rounded-[2px] p-2 flex items-center justify-between gap-2 shrink-0 transition"
            >
              <button
                type="button"
                onClick={() => onLoadScan(scan)}
                className="text-left min-w-0 flex-1 hover:text-amber-300 transition"
              >
                <div className="font-bold text-slate-100 truncate">{scan.title}</div>
                <div className="text-[10px] text-slate-400 truncate tabular-nums">
                  {scan.components?.length || 0} parts · {scan.nets?.length || 0} nets ·{' '}
                  {scan.hotspots?.length || 0} hotspots
                </div>
              </button>
              <button
                type="button"
                onClick={() => onDeleteScan(scan.id)}
                className="p-1 text-slate-500 hover:text-rose-400 transition shrink-0"
                title="Delete Saved PCB Map"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
