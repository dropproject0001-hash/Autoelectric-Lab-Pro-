/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import type { AutomotiveKnowledgeCatalog } from '../types/automotiveKnowledge';
import {
  buildOemCountingMonitorSnapshot,
  filterOemCorrelationRows,
  summarizeCorrelationRows,
  type OemCorrelationFilterMode,
  type OemCorrelationMonitorRow,
} from '../utils/oemCountingMonitor';
import { playCockpitTabDetent, playRotaryEncoderTick } from '../utils/audioFeedback';

export interface OemCountingMonitorProps {
  catalog: AutomotiveKnowledgeCatalog;
  selectedMake: string;
  selectedModel: string;
  searchQuery: string;
  onSelectBrandFilter: (makeSlug: string) => void;
  onSelectVehicleRow: (row: OemCorrelationMonitorRow) => void;
  onLaunchBenchContext?: (make: string, model: string) => void;
}

export const OemCountingMonitor: React.FC<OemCountingMonitorProps> = ({
  catalog,
  selectedMake,
  selectedModel,
  searchQuery,
  onSelectBrandFilter,
  onSelectVehicleRow,
  onLaunchBenchContext,
}) => {
  const [correlationFilter, setCorrelationFilter] =
    useState<OemCorrelationFilterMode>('ALL');
  const [syncWithSearch, setSyncWithSearch] = useState(true);
  const [isTableExpanded, setIsTableExpanded] = useState(true);

  const snapshot = useMemo(
    () => buildOemCountingMonitorSnapshot(catalog),
    [catalog]
  );

  const filteredRows = useMemo(
    () =>
      filterOemCorrelationRows(snapshot.rows, {
        correlationFilter,
        makeSlug: syncWithSearch ? selectedMake : 'all',
        query: syncWithSearch ? searchQuery : '',
      }),
    [snapshot.rows, correlationFilter, syncWithSearch, selectedMake, searchQuery]
  );

  const filteredSummary = useMemo(
    () => summarizeCorrelationRows(filteredRows),
    [filteredRows]
  );

  const matchRateHeadline = `${snapshot.overallMatchRatePercent.toFixed(1)}% Match Rate`;

  return (
    <section
      aria-label="OEM Knowledge Counting Monitor"
      data-testid="oem-counting-monitor"
      className="mt-6 space-y-4"
    >
      {/* 4-Card Primary KPI Telemetry Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <article
          data-testid="oem-kpi-profiles"
          className="rounded-xl border border-[#203653] bg-[#0A1220] px-4 py-4 sm:px-5 sm:py-5"
        >
          <p className="text-[11px] sm:text-xs font-mono uppercase tracking-wider text-[#91A4BD]">
            OEM Profiles
          </p>
          <p className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-white font-mono tabular-nums">
            {snapshot.oemProfilesCount.toLocaleString()}
          </p>
          <p className="mt-2 text-xs font-semibold text-[#20D889] whitespace-nowrap">
            Across {snapshot.brandCount} Major Brands
          </p>
        </article>

        <article
          data-testid="oem-kpi-cavities"
          className="rounded-xl border border-[#203653] bg-[#0A1220] px-4 py-4 sm:px-5 sm:py-5"
        >
          <p className="text-[11px] sm:text-xs font-mono uppercase tracking-wider text-[#91A4BD]">
            Cavities Mapped
          </p>
          <p className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-white font-mono tabular-nums">
            {snapshot.fbiCavitiesMapped.toLocaleString()}
          </p>
          <p className="mt-2 text-xs font-semibold text-[#20D889] font-mono tabular-nums whitespace-nowrap">
            +{snapshot.smcFleetCavities.toLocaleString()} SMC Fleet
          </p>
        </article>

        <article
          data-testid="oem-kpi-correlated"
          className="rounded-xl border border-[#203653] bg-[#0A1220] px-4 py-4 sm:px-5 sm:py-5"
        >
          <p className="text-[11px] sm:text-xs font-mono uppercase tracking-wider text-[#91A4BD]">
            Dual-OEM Correlated
          </p>
          <p className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-white font-mono tabular-nums">
            {snapshot.dualOemCorrelatedCount.toLocaleString()}
          </p>
          <p
            title={`${snapshot.totalCorrelatedCircuits.toLocaleString()} of ${snapshot.dualOemBaselineFbiCavities.toLocaleString()} circuits matched across ${snapshot.dualOemCorrelatedCount} Dual-OEM vehicles`}
            className="mt-2 text-xs font-semibold text-[#20D889] font-mono tabular-nums whitespace-nowrap"
          >
            {matchRateHeadline}
          </p>
        </article>

        <article
          data-testid="oem-kpi-integrity"
          className="rounded-xl border border-[#203653] bg-[#0A1220] px-4 py-4 sm:px-5 sm:py-5"
        >
          <p className="text-[11px] sm:text-xs font-mono uppercase tracking-wider text-[#91A4BD]">
            Integrity Policy
          </p>
          <p className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-white font-mono tabular-nums">
            {snapshot.integrityPolicyPercent}%
          </p>
          <p className="mt-2 text-xs font-semibold text-[#20D889] whitespace-nowrap">
            Zero-Fabrication
          </p>
        </article>
      </div>

      {/* Live Fleet & Brand Breakdown Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-[#91A4BD]">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono tabular-nums">
          <span>
            Combined Cavities:{' '}
            <strong className="text-white">
              {snapshot.totalCombinedCavities.toLocaleString()}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Fuse Boxes:{' '}
            <strong className="text-white">
              {snapshot.totalFuseBoxesMapped.toLocaleString()}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            SMC Profiles:{' '}
            <strong className="text-white">{snapshot.smcProfilesCount}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span data-testid="oem-directory-manufacturer-count">
            OEM Directory:{' '}
            <strong className="text-white">
              {snapshot.catalogManufacturerCount.toLocaleString()} Makes
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Indexed References:{' '}
            <strong className="text-white">
              {snapshot.catalogReferenceCount.toLocaleString()}
            </strong>{' '}
            ({snapshot.catalogVerifiedCount.toLocaleString()} Verified)
          </span>
        </div>

        <div
          role="group"
          aria-label="Filter monitor by OEM brand"
          className="flex flex-wrap items-center gap-1.5"
        >
          <button
            type="button"
            onClick={() => {
              playRotaryEncoderTick();
              onSelectBrandFilter('all');
            }}
            className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded-md transition whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19C8F5] ${
              selectedMake === 'all'
                ? 'bg-[#19C8F5] text-slate-950 font-bold'
                : 'bg-[#0A1220] border border-[#203653] text-[#91A4BD] hover:text-white'
            }`}
          >
            All ({snapshot.oemProfilesCount})
          </button>
          {snapshot.brands.map((b) => {
            const active = selectedMake.toLowerCase() === b.makeSlug;
            return (
              <button
                key={b.makeSlug}
                type="button"
                onClick={() => {
                  playRotaryEncoderTick();
                  onSelectBrandFilter(active ? 'all' : b.makeSlug);
                }}
                className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded-md transition whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19C8F5] ${
                  active
                    ? 'bg-[#19C8F5] text-slate-950 font-bold'
                    : 'bg-[#0A1220] border border-[#203653] text-[#91A4BD] hover:text-white'
                }`}
              >
                {b.brand} ({b.profileCount})
              </button>
            );
          })}
        </div>
      </div>

      {/* Dual-OEM Ingestion & Power Distribution Correlation Table */}
      <div className="rounded-xl border border-[#203653] bg-[#0A1220] overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-4 sm:px-5 border-b border-[#203653]">
          <div className="flex flex-wrap items-center justify-between lg:justify-start gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Dual-OEM Ingestion &amp; Power Distribution Correlation
              </h2>
              <p className="text-xs text-[#91A4BD] mt-0.5 font-mono tabular-nums">
                Showing {filteredRows.length} of {snapshot.oemProfilesCount} OEM profiles · Click any vehicle row to filter repair manuals below
              </p>
            </div>
            <div
              data-testid="oem-provenance-status"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#20D889]/45 bg-[#20D889]/10 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-[#20D889] whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span>
                Provenance: {snapshot.zeroFabricationVerified ? 'Verified' : 'Partial'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Correlation source filter"
              className="inline-flex items-center gap-1 rounded-lg bg-[#050A14] p-1 border border-[#203653]"
            >
              <button
                type="button"
                onClick={() => {
                  playRotaryEncoderTick();
                  setCorrelationFilter('ALL');
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition whitespace-nowrap shrink-0 cursor-pointer ${
                  correlationFilter === 'ALL'
                    ? 'bg-[#122238] text-white font-semibold'
                    : 'text-[#91A4BD] hover:text-white'
                }`}
              >
                All ({snapshot.oemProfilesCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  playRotaryEncoderTick();
                  setCorrelationFilter('DUAL_OEM');
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition whitespace-nowrap shrink-0 cursor-pointer ${
                  correlationFilter === 'DUAL_OEM'
                    ? 'bg-[#122238] text-[#20D889] font-semibold'
                    : 'text-[#91A4BD] hover:text-white'
                }`}
              >
                Dual-OEM ({snapshot.dualOemCorrelatedCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  playRotaryEncoderTick();
                  setCorrelationFilter('SINGLE_SOURCE');
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition whitespace-nowrap shrink-0 cursor-pointer ${
                  correlationFilter === 'SINGLE_SOURCE'
                    ? 'bg-[#122238] text-[#19C8F5] font-semibold'
                    : 'text-[#91A4BD] hover:text-white'
                }`}
              >
                FBI Only ({snapshot.singleSourceCount})
              </button>
            </div>

            {(selectedMake !== 'all' || searchQuery.trim().length > 0) && (
              <button
                type="button"
                onClick={() => {
                  playRotaryEncoderTick();
                  setSyncWithSearch((prev) => !prev);
                }}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#203653] bg-[#050A14] text-[#91A4BD] hover:text-white transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                {syncWithSearch ? 'Show Full Fleet' : 'Sync With Filters'}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                playCockpitTabDetent();
                setIsTableExpanded((prev) => !prev);
              }}
              aria-expanded={isTableExpanded}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#203653] bg-[#050A14] text-[#EAF3FF] hover:border-[#19C8F5]/60 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{isTableExpanded ? 'Hide Table' : 'Show Table'}</span>
              {isTableExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {isTableExpanded && (
          <div className="overflow-x-auto">
            {filteredRows.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-semibold text-white">
                  No OEM correlation profiles match the active filter.
                </p>
                <p className="text-xs text-[#91A4BD] mt-1">
                  Reset the correlation filter or show the full 17-profile fleet.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    playRotaryEncoderTick();
                    setCorrelationFilter('ALL');
                    setSyncWithSearch(false);
                  }}
                  className="mt-3 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#19C8F5]/15 text-[#19C8F5] hover:bg-[#19C8F5]/25 transition cursor-pointer"
                >
                  Show All {snapshot.oemProfilesCount} OEM Profiles
                </button>
              </div>
            ) : (
              <table
                data-testid="oem-correlation-table"
                className="w-full min-w-[680px] border-collapse text-left text-xs sm:text-sm"
              >
                <thead>
                  <tr className="border-b border-[#203653] bg-[#070E1A] text-[11px] font-mono uppercase tracking-wider text-[#91A4BD]">
                    <th scope="col" className="py-3 pl-4 pr-3 sm:pl-5 font-semibold">
                      Vehicle Model
                    </th>
                    <th scope="col" className="py-3 px-3 font-semibold whitespace-nowrap">
                      Years
                    </th>
                    <th scope="col" className="py-3 px-3 font-semibold whitespace-nowrap">
                      Chassis
                    </th>
                    <th
                      scope="col"
                      className="py-3 px-3 font-semibold text-right whitespace-nowrap"
                    >
                      FBI Cavities
                    </th>
                    <th
                      scope="col"
                      className="py-3 px-3 font-semibold text-right whitespace-nowrap"
                    >
                      SMC Cavities
                    </th>
                    <th
                      scope="col"
                      className="py-3 px-3 font-semibold text-right whitespace-nowrap"
                    >
                      Matched
                    </th>
                    <th
                      scope="col"
                      className="py-3 pl-3 pr-4 sm:pr-5 font-semibold text-right whitespace-nowrap"
                    >
                      Verification
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#203653]/70">
                  {filteredRows.map((row) => {
                    const isRowSelected =
                      selectedMake.toLowerCase() === row.makeSlug &&
                      selectedModel.toLowerCase() === row.model.toLowerCase();

                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          isRowSelected
                            ? 'bg-[#19C8F5]/10'
                            : 'hover:bg-[#111E33]/75'
                        }`}
                      >
                        <td className="py-3 pl-4 pr-3 sm:pl-5">
                          <button
                            type="button"
                            onClick={() => {
                              playRotaryEncoderTick();
                              onSelectVehicleRow(row);
                            }}
                            className="text-left font-semibold text-white hover:text-[#19C8F5] transition cursor-pointer focus-visible:outline-none focus-visible:underline"
                          >
                            {row.displayModel}
                          </button>
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-[#C8D7EC] whitespace-nowrap">
                          {row.yearsLabel}
                        </td>
                        <td className="py-3 px-3 font-mono text-[#C8D7EC] whitespace-nowrap">
                          {row.chassisCode}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-white">
                          {row.fbiCavities.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#C8D7EC]">
                          {row.smcCavities !== null
                            ? row.smcCavities.toLocaleString()
                            : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {row.matchRatePercent !== null ? (
                            <span className="text-[#20D889] font-semibold">
                              {row.correlatedCircuits.toLocaleString()} ({row.matchRatePercent}%)
                            </span>
                          ) : (
                            <span className="text-[#91A4BD]">—</span>
                          )}
                        </td>
                        <td className="py-3 pl-3 pr-4 sm:pr-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-2.5">
                            {row.confidenceRating === 'DUAL_OEM_CONFIRMED' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#20D889]">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                <span>Dual-OEM</span>
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-[#91A4BD]">
                                Single OEM
                              </span>
                            )}
                            {onLaunchBenchContext && (
                              <button
                                type="button"
                                onClick={() => {
                                  playCockpitTabDetent();
                                  onLaunchBenchContext(row.brand, row.model);
                                }}
                                aria-label={`Load ${row.displayModel} into Bench Lab`}
                                className="text-[11px] font-semibold text-[#19C8F5] hover:underline cursor-pointer"
                              >
                                Bench
                              </button>
                            )}
                            <a
                              href={row.fbiSourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Open verified Fuse-Box.info source for ${row.displayModel}`}
                              className="text-[#91A4BD] hover:text-white transition"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#203653] bg-[#070E1A] font-mono tabular-nums text-xs text-[#EAF3FF]">
                    <td className="py-3 pl-4 pr-3 sm:pl-5 font-bold">
                      Total ({filteredSummary.profileCount} Profiles)
                    </td>
                    <td className="py-3 px-3 text-[#91A4BD]">
                      {filteredSummary.dualOemCount} Dual-OEM
                    </td>
                    <td className="py-3 px-3 text-[#91A4BD]">
                      {snapshot.brandCount} Brands
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-white">
                      {filteredSummary.fbiCavitiesTotal.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-[#C8D7EC]">
                      {filteredSummary.smcPairedCavitiesTotal > 0
                        ? filteredSummary.smcPairedCavitiesTotal.toLocaleString()
                        : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-[#20D889] whitespace-nowrap">
                      {filteredSummary.weightedMatchRatePercent !== null
                        ? `${filteredSummary.correlatedCircuitsTotal.toLocaleString()} (${filteredSummary.weightedMatchRatePercent.toFixed(1)}%)`
                        : '—'}
                    </td>
                    <td className="py-3 pl-3 pr-4 sm:pr-5 text-right text-[#20D889] font-semibold whitespace-nowrap">
                      100% Zero-Fab
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
