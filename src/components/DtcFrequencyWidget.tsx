import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Save,
  AlertTriangle,
  Globe,
  Filter,
} from 'lucide-react';
import { SavedBenchSession, SavedDiagnosticLog } from '../services/benchStorageService';
import { DiagnosticTroubleCode } from '../types/ecu';

export interface DtcFrequencyDatum {
  dtcCode: string;
  count: number;
  percentage: number;
  sessionCount: number;
  logCount: number;
  ecuProfiles: string[];
  sampleTitles: string[];
  isCurrentlyActive: boolean;
}

interface DtcFrequencyWidgetProps {
  savedSessions: SavedBenchSession[];
  savedLogs: SavedDiagnosticLog[];
  liveActiveDtcs?: DiagnosticTroubleCode[];
  onSelectDtc?: (dtcCode: string) => void;
  onSearchGroundingDtc?: (dtcCode: string) => void;
  onOpenSavedBenches?: () => void;
}

const KNOWN_DTC_DESCRIPTIONS: Record<string, string> = {
  P0122: 'TPS Signal Low Input (< 0.20V)',
  P0123: 'TPS Signal High Input (> 4.80V)',
  P0117: 'ECT Coolant Temp Sensor Low Input (< 0.15V)',
  P0118: 'ECT Coolant Temp Sensor High Input (> 4.85V)',
  U0001: 'High-Speed CAN Communication Bus Fault',
  P0093: 'Fuel System Large Leak / Rail Pressure Drop',
  P0606: 'ECM / PCM Processor Fault',
  P0215: 'Engine Shutoff Solenoid / PCM Power Relay',
  P0201: 'Cylinder 1 Injector Circuit Malfunction',
  P0202: 'Cylinder 2 Injector Circuit Malfunction',
  P0203: 'Cylinder 3 Injector Circuit Malfunction',
  P0204: 'Cylinder 4 Injector Circuit Malfunction',
};

const extractNormalizedDtcs = (raw: string): string[] => {
  if (!raw) return [];
  const matches = raw.toUpperCase().match(/\b[PCBU][0-9A-F]{4}\b/g);
  if (matches && matches.length > 0) {
    return Array.from(new Set(matches));
  }
  const trimmed = raw.trim().toUpperCase();
  return trimmed ? [trimmed] : [];
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DtcFrequencyDatum }>;
}

const CustomDtcTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }

  const item = payload[0].payload;
  const knownDesc = KNOWN_DTC_DESCRIPTIONS[item.dtcCode];

  return (
    <div className="bg-[#0b0d11] border border-amber-500/70 rounded-[2px] p-2.5 shadow-xl text-[11px] font-mono max-w-[260px] text-slate-100">
      <div className="flex items-center justify-between gap-3 border-b border-[#2b313c] pb-1.5 mb-1.5">
        <span className="font-bold text-amber-300 text-xs">{item.dtcCode}</span>
        <span className="px-1.5 py-0.5 rounded-[2px] bg-[#0d1912] border border-emerald-700 text-emerald-300 font-bold text-[10px]">
          {item.count} {item.count === 1 ? 'occurrence' : 'occurrences'} ({item.percentage}%)
        </span>
      </div>

      {knownDesc && (
        <p className="text-slate-300 font-sans text-[11px] mb-1.5 leading-snug">{knownDesc}</p>
      )}

      <div className="text-[10px] text-slate-400 space-y-0.5">
        <div>
          Sessions: <strong className="text-slate-200">{item.sessionCount}</strong>
          {item.logCount > 0 && (
            <>
              {' '}
              · Logs: <strong className="text-slate-200">{item.logCount}</strong>
            </>
          )}
        </div>
        {item.ecuProfiles.length > 0 && (
          <div className="truncate">
            ECUs: <span className="text-amber-300">{item.ecuProfiles.join(', ')}</span>
          </div>
        )}
        {item.sampleTitles.length > 0 && (
          <div className="pt-1 border-t border-[#242a34] mt-1">
            <span className="text-slate-500 block">Recent records:</span>
            {item.sampleTitles.slice(0, 3).map((title, idx) => (
              <div key={idx} className="truncate text-slate-300">
                • {title}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-1.5 pt-1 border-t border-[#242a34] text-[9px] text-amber-400">
        Click bar to filter manuals for {item.dtcCode}
      </div>
    </div>
  );
};

export const DtcFrequencyWidget: React.FC<DtcFrequencyWidgetProps> = ({
  savedSessions,
  savedLogs,
  liveActiveDtcs = [],
  onSelectDtc,
  onSearchGroundingDtc,
  onOpenSavedBenches,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [dataScope, setDataScope] = useState<'SESSIONS_ONLY' | 'SESSIONS_AND_LOGS'>('SESSIONS_ONLY');
  const [ecuFilter, setEcuFilter] = useState<string>('ALL');

  const liveCodeSet = useMemo(
    () => new Set(liveActiveDtcs.map((d) => d.code.toUpperCase())),
    [liveActiveDtcs]
  );

  // Distinct ECU labels observed across saved sessions & logs
  const availableEcus = useMemo(() => {
    const set = new Set<string>();
    for (const s of savedSessions) {
      if (s.ecuProfileLabel?.trim()) set.add(s.ecuProfileLabel.trim());
    }
    if (dataScope === 'SESSIONS_AND_LOGS') {
      for (const l of savedLogs) {
        if (l.ecuModel?.trim()) set.add(l.ecuModel.trim());
      }
    }
    return Array.from(set).sort();
  }, [savedSessions, savedLogs, dataScope]);

  const { chartData, totalRecordsInspected, nominalSessionCount, topDtc } = useMemo(() => {
    const filteredSessions =
      ecuFilter === 'ALL'
        ? savedSessions
        : savedSessions.filter((s) => s.ecuProfileLabel?.trim() === ecuFilter);

    const filteredLogs =
      dataScope === 'SESSIONS_AND_LOGS'
        ? ecuFilter === 'ALL'
          ? savedLogs
          : savedLogs.filter((l) => l.ecuModel?.trim() === ecuFilter)
        : [];

    const map = new Map<
      string,
      {
        sessionIds: Set<string>;
        logIds: Set<string>;
        ecus: Set<string>;
        titles: string[];
      }
    >();

    let nominalCount = 0;

    for (const session of filteredSessions) {
      const codes = Array.isArray(session.activeDtcs)
        ? Array.from(
            new Set(
              session.activeDtcs
                .map((c) => String(c).trim().toUpperCase())
                .filter(Boolean)
            )
          )
        : [];

      if (codes.length === 0) {
        nominalCount += 1;
        continue;
      }

      for (const code of codes) {
        const entry = map.get(code) ?? {
          sessionIds: new Set<string>(),
          logIds: new Set<string>(),
          ecus: new Set<string>(),
          titles: [],
        };
        if (!entry.sessionIds.has(session.id)) {
          entry.sessionIds.add(session.id);
          if (session.title) entry.titles.push(session.title);
        }
        if (session.ecuProfileLabel) entry.ecus.add(session.ecuProfileLabel);
        map.set(code, entry);
      }
    }

    for (const log of filteredLogs) {
      const codes = extractNormalizedDtcs(log.dtcCode || '');
      for (const code of codes) {
        const entry = map.get(code) ?? {
          sessionIds: new Set<string>(),
          logIds: new Set<string>(),
          ecus: new Set<string>(),
          titles: [],
        };
        if (!entry.logIds.has(log.id)) {
          entry.logIds.add(log.id);
          if (log.title) entry.titles.push(log.title);
        }
        if (log.ecuModel) entry.ecus.add(log.ecuModel);
        map.set(code, entry);
      }
    }

    const totalInspected = filteredSessions.length + filteredLogs.length;

    const rows: DtcFrequencyDatum[] = Array.from(map.entries())
      .map(([dtcCode, stats]) => {
        const sessionCount = stats.sessionIds.size;
        const logCount = stats.logIds.size;
        const count = sessionCount + logCount;
        return {
          dtcCode,
          count,
          percentage: totalInspected > 0 ? Math.round((count / totalInspected) * 100) : 0,
          sessionCount,
          logCount,
          ecuProfiles: Array.from(stats.ecus),
          sampleTitles: stats.titles,
          isCurrentlyActive: liveCodeSet.has(dtcCode),
        };
      })
      .sort((a, b) => b.count - a.count || a.dtcCode.localeCompare(b.dtcCode));

    return {
      chartData: rows,
      totalRecordsInspected: totalInspected,
      nominalSessionCount: nominalCount,
      topDtc: rows[0] ?? null,
    };
  }, [savedSessions, savedLogs, dataScope, ecuFilter, liveCodeSet]);

  const handleBarClick = (barData: unknown) => {
    if (!onSelectDtc || !barData || typeof barData !== 'object') return;
    const candidate = barData as { payload?: DtcFrequencyDatum; dtcCode?: string };
    const code = candidate.payload?.dtcCode || candidate.dtcCode;
    if (code) {
      onSelectDtc(code);
    }
  };

  return (
    <section
      aria-label="Detected DTC Frequency Across Saved Diagnostic Sessions"
      className="hud-panel rounded-[3px] shrink-0 overflow-hidden"
    >
      {/* Compact Header Bar */}
      <div className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 hud-header">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-[2px] bg-[#0e1410] border border-emerald-600/60 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-hud font-bold text-slate-100 uppercase tracking-wide">
                DTC Occurrence Frequency Across Saved Sessions
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-[2px] bg-[#090b0f] border border-[#2b313c] text-amber-300 font-semibold">
                {totalRecordsInspected}{' '}
                {dataScope === 'SESSIONS_ONLY' ? 'Sessions' : 'Records'} · {chartData.length}{' '}
                Unique DTCs
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans truncate">
              Visualizes MNA-detected DTC recurrence from your saved diagnostic sessions to prioritize fault guides
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isExpanded && (
            <>
              <div className="flex items-center bg-[#090b0f] p-0.5 rounded-[2px] border border-[#2b313c] text-[10px]">
                <button
                  type="button"
                  onClick={() => setDataScope('SESSIONS_ONLY')}
                  className={`px-2 py-1 rounded-[2px] font-semibold transition ${
                    dataScope === 'SESSIONS_ONLY'
                      ? 'hw-btn-amber text-amber-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Sessions Only
                </button>
                <button
                  type="button"
                  onClick={() => setDataScope('SESSIONS_AND_LOGS')}
                  className={`px-2 py-1 rounded-[2px] font-semibold transition ${
                    dataScope === 'SESSIONS_AND_LOGS'
                      ? 'hw-btn-amber text-amber-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  + Saved Logs
                </button>
              </div>

              {availableEcus.length > 0 && (
                <div className="hidden sm:flex items-center gap-1 hw-lcd-well rounded-[2px] px-2 py-1 text-[10px]">
                  <Filter className="w-3 h-3 text-slate-400" />
                  <select
                    aria-label="Filter DTC graph by ECU profile"
                    value={ecuFilter}
                    onChange={(e) => setEcuFilter(e.target.value)}
                    className="bg-transparent text-amber-300 font-semibold focus:outline-none cursor-pointer max-w-[140px]"
                  >
                    <option value="ALL" className="bg-[#0e1116]">
                      All ECU Profiles
                    </option>
                    {availableEcus.map((ecu) => (
                      <option key={ecu} value={ecu} className="bg-[#0e1116]">
                        {ecu}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="hw-btn px-2.5 py-1 rounded-[2px] text-slate-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
          >
            {isExpanded ? (
              <>
                <span>Collapse</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <span>Expand Chart</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Chart Body */}
      {isExpanded && (
        <div className="p-3 bg-[#101319]">
          {chartData.length === 0 ? (
            <div className="rounded-[2px] border border-dashed border-[#343c4b] bg-[#0b0d11] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-[2px] bg-[#1e170a] border border-amber-700/70 shrink-0">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100">
                    {totalRecordsInspected === 0
                      ? 'No saved diagnostic sessions yet'
                      : `${totalRecordsInspected} saved ${
                          totalRecordsInspected === 1 ? 'session' : 'sessions'
                        } inspected — 0 DTC faults recorded`}
                  </h4>
                  <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                    Inject or simulate a fault in Bench Lab (e.g., TPS Short to GND → P0122) and save a bench snapshot to plot DTC frequency here.
                  </p>
                </div>
              </div>
              {onOpenSavedBenches && (
                <button
                  type="button"
                  onClick={onOpenSavedBenches}
                  className="hw-btn-green px-3 py-1.5 rounded-[2px] text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Bench Snapshot</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {/* Mini Metrics Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
                <div className="hw-lcd-well rounded-[2px] px-2.5 py-1.5 flex items-center justify-between">
                  <span className="text-slate-400">Saved Sessions</span>
                  <strong className="text-slate-100 tabular-nums">{savedSessions.length}</strong>
                </div>
                <div className="hw-lcd-well rounded-[2px] px-2.5 py-1.5 flex items-center justify-between">
                  <span className="text-slate-400">Distinct DTCs</span>
                  <strong className="text-emerald-400 tabular-nums">{chartData.length}</strong>
                </div>
                <div className="hw-lcd-well rounded-[2px] px-2.5 py-1.5 flex items-center justify-between">
                  <span className="text-slate-400">Top Fault Code</span>
                  <strong className="text-amber-300 tabular-nums">
                    {topDtc ? `${topDtc.dtcCode} (${topDtc.count}x)` : '—'}
                  </strong>
                </div>
                <div className="hw-lcd-well rounded-[2px] px-2.5 py-1.5 flex items-center justify-between">
                  <span className="text-slate-400">Nominal Sessions</span>
                  <strong className="text-emerald-400 tabular-nums">{nominalSessionCount}</strong>
                </div>
              </div>

              {/* Recharts BarChart */}
              <div className="w-full h-[195px] min-w-0 hw-lcd-well rounded-[2px] pt-3 pr-3 pb-1 pl-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 6, right: 12, left: -12, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e242e" vertical={false} />
                    <XAxis
                      dataKey="dtcCode"
                      stroke="#94a3b8"
                      tick={{ fill: '#cbd5e1', fontSize: 11, fontFamily: 'monospace' }}
                      axisLine={{ stroke: '#343c4b' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                      axisLine={{ stroke: '#343c4b' }}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(245, 158, 11, 0.08)' }}
                      content={<CustomDtcTooltip />}
                    />
                    <Bar
                      dataKey="count"
                      name="Occurrences"
                      radius={[2, 2, 0, 0]}
                      maxBarSize={48}
                      className="cursor-pointer"
                      onClick={handleBarClick}
                    >
                      {chartData.map((entry) => (
                        <Cell
                          key={entry.dtcCode}
                          fill={entry.isCurrentlyActive ? '#f59e0b' : '#22c55e'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Legend & Quick Top-DTC Grounding Action */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-[1px] bg-emerald-500 inline-block" />
                    Historical Saved Occurrence
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-[1px] bg-amber-500 inline-block" />
                    Also Active on Live Bench
                  </span>
                </div>

                {topDtc && onSearchGroundingDtc && (
                  <button
                    type="button"
                    onClick={() => onSearchGroundingDtc(topDtc.dtcCode)}
                    className="text-amber-300 hover:text-amber-200 flex items-center gap-1 font-semibold transition cursor-pointer"
                  >
                    <Globe className="w-3 h-3" />
                    <span>Lookup Top Fault ({topDtc.dtcCode}) TSBs</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
