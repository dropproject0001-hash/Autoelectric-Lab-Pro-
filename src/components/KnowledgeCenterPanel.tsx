/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useState, useMemo } from 'react';
import {
  Search,
  BookOpen,
  ExternalLink,
  ShieldCheck,
  Filter,
  Car,
  Layers,
  Database,
  Download,
  Upload,
  Clock,
} from 'lucide-react';
import {
  loadAutomotiveKnowledgeCatalog,
  searchAutomotiveKnowledge,
  exportCatalogToJson,
  importCatalogFromJson,
  importOemManufacturersFromCsv,
} from '../services/automotiveKnowledgeService';
import { SYSTEM_CATEGORIES } from '../data/automotiveKnowledgeSeed';
import { SystemCategoryId } from '../types/automotiveKnowledge';
import { playCockpitTabDetent, playRotaryEncoderTick } from '../utils/audioFeedback';
import { resolveLatestOemKnowledgeTimestamp } from '../utils/oemCountingMonitor';
import { OemCountingMonitor } from './OemCountingMonitor';

interface KnowledgeCenterPanelProps {
  onSelectVehicleContext?: (make: string, model: string) => void;
}

export const KnowledgeCenterPanel: React.FC<KnowledgeCenterPanelProps> = ({
  onSelectVehicleContext,
}) => {
  const [catalog, setCatalog] = useState(() => loadAutomotiveKnowledgeCatalog());
  const lastUpdatedMeta = useMemo(
    () => resolveLatestOemKnowledgeTimestamp({ catalogGeneratedAt: catalog.generatedAt }),
    [catalog.generatedAt]
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMake, setSelectedMake] = useState<string>('all');
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [importExportStatus, setImportExportStatus] = useState<string | null>(null);

  const sortedManufacturers = useMemo(
    () => [...catalog.manufacturers].sort((a, b) => a.make.localeCompare(b.make)),
    [catalog.manufacturers]
  );

  const selectedManufacturerRecord = useMemo(() => {
    if (selectedMake === 'all') return null;
    return (
      catalog.manufacturers.find(
        (m) => m.slug.toLowerCase() === selectedMake.toLowerCase()
      ) ?? null
    );
  }, [catalog.manufacturers, selectedMake]);

  const availableModels = useMemo(() => {
    if (selectedMake === 'all') {
      return catalog.vehicles.map((v) => v.model);
    }
    return catalog.vehicles
      .filter((v) => v.makeSlug.toLowerCase() === selectedMake.toLowerCase())
      .map((v) => v.model);
  }, [catalog, selectedMake]);

  const searchResults = useMemo(() => {
    return searchAutomotiveKnowledge({
      query: searchQuery,
      make: selectedMake,
      model: selectedModel,
      systemCategoryId: selectedCategory as SystemCategoryId | 'all',
      verifiedOnly,
    });
  }, [catalog, searchQuery, selectedMake, selectedModel, selectedCategory, verifiedOnly]);

  const handleExport = () => {
    const jsonStr = exportCatalogToJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `automotive_knowledge_index_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setImportExportStatus('Catalog exported successfully.');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        if (isCsv) {
          const res = importOemManufacturersFromCsv(content);
          if (res.success) {
            setCatalog(loadAutomotiveKnowledgeCatalog());
            setImportExportStatus(
              `Imported ${res.addedCount} new OEM manufacturers (${res.duplicateCount} duplicates skipped, ${res.totalManufacturers} unique makes saved).`
            );
          } else {
            setImportExportStatus(`CSV import failed: ${res.error}`);
          }
        } else {
          const res = importCatalogFromJson(content);
          if (res.success) {
            setCatalog(loadAutomotiveKnowledgeCatalog());
            setImportExportStatus(
              `Catalog merged cleanly: ${res.count} repair references (${res.duplicatesSkipped ?? 0} duplicates skipped).`
            );
          } else {
            setImportExportStatus(`Import failed: ${res.error}`);
          }
        }
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#050A14] text-[#EAF3FF] overflow-y-auto p-4 sm:p-6 lg:p-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#203653]">
        <div>
          <div className="flex items-center gap-2 text-[#19C8F5] text-xs font-mono uppercase tracking-widest mb-1">
            <BookOpen className="h-4 w-4" />
            <span>Automotive Knowledge Index & Repair Reference Engine</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            OEM Metadata & Service Knowledge Center
          </h1>
          <p className="text-sm text-[#91A4BD] mt-1 max-w-2xl">
            Search indexed service manuals, Dual-OEM fuse/relay layouts, and {catalog.manufacturers.length} deduplicated OEM manufacturer directories with verified provenance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              playCockpitTabDetent();
              handleExport();
            }}
            className="flex min-h-[38px] items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0A1220] border border-[#203653] text-[#19C8F5] hover:bg-[#121E33] transition cursor-pointer whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export JSON</span>
          </button>

          <label className="flex min-h-[38px] items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0A1220] border border-[#203653] text-[#20D889] hover:bg-[#121E33] transition cursor-pointer whitespace-nowrap">
            <Upload className="h-3.5 w-3.5" />
            <span>Import JSON / CSV</span>
            <input type="file" accept=".json,.csv" onChange={handleImportFile} className="hidden" />
          </label>
        </div>
      </div>

      {importExportStatus && (
        <div className="my-4 p-3 rounded-lg bg-[#0A1220] border border-[#19C8F5]/30 text-xs text-[#19C8F5] font-mono">
          {importExportStatus}
        </div>
      )}

      {/* Live OEM Information Counting Monitor & Dual-OEM Correlation Table */}
      <OemCountingMonitor
        catalog={catalog}
        selectedMake={selectedMake}
        selectedModel={selectedModel}
        searchQuery={searchQuery}
        onSelectBrandFilter={(makeSlug) => {
          setSelectedMake(makeSlug);
          setSelectedModel('all');
        }}
        onSelectVehicleRow={(row) => {
          const isSame =
            selectedMake.toLowerCase() === row.makeSlug &&
            selectedModel.toLowerCase() === row.model.toLowerCase();
          if (isSame) {
            setSelectedMake('all');
            setSelectedModel('all');
          } else {
            setSelectedMake(row.makeSlug);
            setSelectedModel(row.model);
          }
        }}
        onLaunchBenchContext={onSelectVehicleContext}
      />

      {/* Search & Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 my-6">
        {/* Search Bar */}
        <div className="sm:col-span-2 relative">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#91A4BD]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vehicle, engine, DTC, component, or topic..."
            className="w-full h-10 pl-10 pr-4 bg-[#0A1220] border border-[#203653] rounded-lg text-sm text-white placeholder-[#91A4BD] focus:outline-none focus:border-[#19C8F5]"
          />
        </div>

        {/* Make Filter */}
        <div className="relative">
          <select
            aria-label="Filter by manufacturer"
            data-testid="knowledge-make-select"
            value={selectedMake}
            onChange={(e) => {
              setSelectedMake(e.target.value);
              setSelectedModel('all');
            }}
            className="w-full h-10 px-3 bg-[#0A1220] border border-[#203653] rounded-lg text-sm text-white focus:outline-none focus:border-[#19C8F5]"
          >
            <option value="all">
              All Manufacturers ({sortedManufacturers.length})
            </option>
            {sortedManufacturers.map((m) => (
              <option key={m.id} value={m.slug}>
                {m.make}
              </option>
            ))}
          </select>
        </div>

        {/* Model Filter */}
        <div className="relative">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full h-10 px-3 bg-[#0A1220] border border-[#203653] rounded-lg text-sm text-white focus:outline-none focus:border-[#19C8F5]"
          >
            <option value="all">All Models</option>
            {Array.from(new Set(availableModels)).map((modelName) => (
              <option key={modelName} value={modelName}>
                {modelName}
              </option>
            ))}
          </select>
        </div>

        {/* System Category Filter */}
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full h-10 px-3 bg-[#0A1220] border border-[#203653] rounded-lg text-sm text-white focus:outline-none focus:border-[#19C8F5]"
          >
            <option value="all">All System Categories</option>
            {SYSTEM_CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Category Pills & Verified Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 mb-6 min-w-0">
        <div className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => {
              playRotaryEncoderTick();
              setSelectedCategory('all');
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#19C8F5] text-slate-950 font-bold'
                : 'bg-[#0A1220] border border-[#203653] text-[#91A4BD] hover:text-white'
            }`}
          >
            All Systems
          </button>
          {SYSTEM_CATEGORIES.slice(0, 6).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                playRotaryEncoderTick();
                setSelectedCategory(cat.id);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-[#19C8F5] text-slate-950 font-bold'
                  : 'bg-[#0A1220] border border-[#203653] text-[#91A4BD] hover:text-white'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            className="rounded bg-[#0A1220] border-[#203653] text-[#19C8F5] focus:ring-0 h-4 w-4"
          />
          <span className="text-xs font-medium text-[#91A4BD]">Verified OEM Sources Only</span>
        </label>
      </div>

      {/* Results Count & Statistics */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#91A4BD] mb-4">
        <span>Showing {searchResults.length} indexed repair references</span>
        <span>
          Catalog Version: {catalog.schemaVersion} ({catalog.statistics.manufacturerCount} OEM makes · {catalog.statistics.referenceCount} records)
        </span>
      </div>

      {/* Reference Results Grid */}
      {searchResults.length === 0 ? (
        selectedManufacturerRecord && selectedManufacturerRecord.catalogUrl ? (
          <div
            data-testid="oem-directory-manufacturer-card"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-xl border border-[#203653] bg-[#0A1220]/90 mb-8"
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#19C8F5]/10 text-[#19C8F5] border border-[#19C8F5]/30">
                  OEM Directory Indexed
                </span>
                <span className="text-xs font-mono text-[#91A4BD]">
                  ID: {selectedManufacturerRecord.id}
                </span>
              </div>
              <h3 className="text-lg font-bold text-white">
                {selectedManufacturerRecord.make} — StartMyCar OEM Model Directory
              </h3>
              <p className="text-xs text-[#91A4BD] max-w-2xl leading-relaxed">
                Saved in the local OEM knowledge database without duplication. Deep fuse-box cavity maps are not fabricated until individual model diagrams are ingested.
              </p>
            </div>
            <a
              href={selectedManufacturerRecord.catalogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#19C8F5]/15 text-[#19C8F5] hover:bg-[#19C8F5]/25 transition whitespace-nowrap shrink-0"
            >
              <span>Open OEM Model Index</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 px-4 rounded-xl border border-[#203653] bg-[#0A1220]/60 text-center my-auto">
            <Database className="h-12 w-12 text-[#91A4BD] mb-3 opacity-60" />
            <p className="text-base font-semibold text-white">Reference not available in the current database.</p>
            <p className="text-xs text-[#91A4BD] mt-1 max-w-md">
              Try adjusting your search filters or select a different manufacturer/model from the catalog.
            </p>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
          {searchResults.map((scored) => {
            const { reference } = scored;
            return (
              <div
                key={reference.id}
                className="flex flex-col justify-between p-5 rounded-xl border border-[#203653] bg-[#0A1220]/90 hover:border-[#19C8F5]/60 transition"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#19C8F5]/10 text-[#19C8F5] border border-[#19C8F5]/30">
                      {reference.make} {reference.model}
                    </span>
                    <span className="text-xs font-mono text-[#91A4BD]">{reference.years}</span>
                  </div>

                  <h3 className="text-base font-bold text-white mb-2 leading-snug">
                    {reference.title}
                  </h3>

                  <p className="text-xs text-[#BCCDEF] line-clamp-3 mb-4 leading-relaxed">
                    {reference.summary}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-[11px] text-[#91A4BD] mb-4 pt-3 border-t border-[#203653] font-mono">
                    <span>Source: {reference.source.sourceName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{reference.source.pageCount ? `${reference.source.pageCount} pages` : 'Metadata'}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {onSelectVehicleContext && (
                      <button
                        type="button"
                        onClick={() => onSelectVehicleContext(reference.make, reference.model)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#19C8F5]/15 text-[#19C8F5] hover:bg-[#19C8F5]/25 transition"
                      >
                        <Car className="h-3.5 w-3.5" />
                        <span>Select Vehicle</span>
                      </button>
                    )}

                    {reference.source.originalUrl && (
                      <a
                        href={reference.source.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#203653]/50 text-[#EAF3FF] hover:bg-[#203653] transition ml-auto"
                      >
                        <span>Source Link</span>
                        <ExternalLink className="h-3.5 w-3.5 text-[#91A4BD]" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Knowledge Center Footer — Compiled OEM Database Timestamp */}
      <footer
        aria-label="Knowledge Center database metadata"
        className="mt-auto pt-4 pb-2 border-t border-[#203653] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#91A4BD]"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums">
          <span>OEM Knowledge Database</span>
          <span aria-hidden="true">·</span>
          <span>Schema v{catalog.schemaVersion}</span>
          <span aria-hidden="true">·</span>
          <span>{catalog.statistics.manufacturerCount} Manufacturers</span>
          <span aria-hidden="true">·</span>
          <span>{catalog.statistics.referenceCount} Records</span>
        </div>

        <div
          data-testid="knowledge-center-last-updated"
          title={
            lastUpdatedMeta.sources.length > 0
              ? lastUpdatedMeta.sources.map((s) => `${s.label}: ${s.iso}`).join('\n')
              : 'Compiled OEM knowledge metadata timestamp'
          }
          className="inline-flex items-center gap-1.5 font-mono tabular-nums text-[#91A4BD] whitespace-nowrap"
        >
          <Clock className="h-3.5 w-3.5 text-[#19C8F5] shrink-0" aria-hidden="true" />
          <span>Last updated:</span>
          {lastUpdatedMeta.latestIso ? (
            <time dateTime={lastUpdatedMeta.latestIso} className="text-[#EAF3FF] font-semibold">
              {lastUpdatedMeta.formattedUtc}
            </time>
          ) : (
            <span className="text-[#EAF3FF] font-semibold">Unavailable</span>
          )}
        </div>
      </footer>
    </div>
  );
};
