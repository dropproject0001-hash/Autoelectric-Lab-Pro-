import React, { useState, useMemo } from 'react';
import {
  Search,
  X,
  Plus,
  Sliders,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Cpu,
  Layers,
  Sparkles,
  Zap,
  Info,
  Check,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import {
  BENCH_COMPONENT_LIBRARY,
  LibraryComponentCategory,
  LibraryComponentTemplate,
  filterBenchComponentLibrary,
  createBenchComponentFromTemplate,
} from '../data/benchComponentLibrary';
import { BenchComponent } from '../types/ecu';
import { RotaryEncoderDial } from './HardwareControls';
import { LabDrawerIcon } from './icons/LabDrawerIcons';

interface BenchComponentLibrarySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onAddComponent: (comp: BenchComponent) => void;
  placedComponents: BenchComponent[];
  onDeleteComponent: (compId: string) => void;
  onUpdateComponentState: (compId: string, updates: Record<string, number | boolean | string>) => void;
  onSelectComponentToCenter?: (compId: string) => void;
}

const CATEGORIES: { id: LibraryComponentCategory; label: string; count: number }[] = [
  { id: 'ALL', label: 'All Items', count: BENCH_COMPONENT_LIBRARY.length },
  { id: 'LEDS', label: 'LEDs & Lamps', count: BENCH_COMPONENT_LIBRARY.filter((c) => c.category === 'LEDS').length },
  { id: 'RESISTORS', label: 'Resistors & Pots', count: BENCH_COMPONENT_LIBRARY.filter((c) => c.category === 'RESISTORS').length },
  { id: 'DIODES', label: 'Diodes & Clamps', count: BENCH_COMPONENT_LIBRARY.filter((c) => c.category === 'DIODES').length },
  { id: 'SWITCHES', label: 'Switches & Relays', count: BENCH_COMPONENT_LIBRARY.filter((c) => c.category === 'SWITCHES').length },
  { id: 'PASSIVES', label: 'Passives & Loads', count: BENCH_COMPONENT_LIBRARY.filter((c) => c.category === 'PASSIVES').length },
];

export const BenchComponentLibrarySidebar: React.FC<BenchComponentLibrarySidebarProps> = ({
  isOpen,
  onClose,
  onAddComponent,
  placedComponents,
  onDeleteComponent,
  onUpdateComponentState,
  onSelectComponentToCenter,
}) => {
  const [activeTab, setActiveTab] = useState<'LIBRARY' | 'ACTIVE_PARTS'>('LIBRARY');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<LibraryComponentCategory>('ALL');
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);

  // Filtered library items
  const filteredTemplates = useMemo(() => {
    return filterBenchComponentLibrary(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  // Placed auxiliary components currently in circuit
  const auxiliaryPlaced = useMemo(() => {
    return placedComponents.filter((c) => c.isAuxiliary);
  }, [placedComponents]);

  const handleAdd = (template: LibraryComponentTemplate) => {
    const newComp = createBenchComponentFromTemplate(template);
    onAddComponent(newComp);
    setRecentlyAddedId(template.id);
    window.setTimeout(() => setRecentlyAddedId(null), 1200);
  };

  const handleDragStart = (e: React.DragEvent, template: LibraryComponentTemplate) => {
    e.dataTransfer.setData('application/json', JSON.stringify(template));
    e.dataTransfer.setData('text/plain', template.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  if (!isOpen) return null;

  return (
    <aside
      className="absolute top-0 right-0 bottom-0 z-30 w-80 sm:w-96 bg-[#13171f] border-l border-[#343c4b] shadow-2xl flex flex-col font-mono select-none transition-all duration-200"
    >
      {/* Header */}
      <div className="p-3 border-b border-[#2a313d] flex items-center justify-between bg-[#101319]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-[2px] bg-[#1a2029] border border-amber-500/50 flex items-center justify-center">
            <LabDrawerIcon name="multi-comp" size={24} className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-100 tracking-wide flex items-center gap-1.5">
              BENCH COMPONENT LIBRARY · PRO
            </h2>
            <p className="text-[10px] text-slate-400 font-sans">
              Drag to canvas or tap &quot;Add&quot; to mount on bench
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-[2px] hover:bg-[#232934] text-slate-400 hover:text-white transition cursor-pointer"
          title="Close Library Sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Top Tabs: Catalog vs Placed Aux Parts */}
      <div className="flex border-b border-[#2a313d] bg-[#101319] text-[11px]">
        <button
          onClick={() => setActiveTab('LIBRARY')}
          className={`flex-1 py-2 px-3 text-center font-bold flex items-center justify-center gap-1.5 transition border-b-2 cursor-pointer ${
            activeTab === 'LIBRARY'
              ? 'border-amber-400 text-amber-300 bg-[#1a2029]'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#161b23]'
          }`}
        >
          <LabDrawerIcon name="cabinet" size={24} className="w-3.5 h-3.5" />
          <span>Catalog ({BENCH_COMPONENT_LIBRARY.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('ACTIVE_PARTS')}
          className={`flex-1 py-2 px-3 text-center font-bold flex items-center justify-center gap-1.5 transition border-b-2 cursor-pointer ${
            activeTab === 'ACTIVE_PARTS'
              ? 'border-amber-400 text-amber-300 bg-[#1a2029]'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#161b23]'
          }`}
        >
          <LabDrawerIcon name="mini-slider" size={24} className="w-3.5 h-3.5" />
          <span>On Bench ({auxiliaryPlaced.length})</span>
        </button>
      </div>

      {activeTab === 'LIBRARY' ? (
        <>
          {/* Search Bar */}
          <div className="p-2.5 border-b border-[#2a313d] bg-[#11151b]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search LEDs, pull-ups, TVS, loads, switches..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0b0e13] border border-[#2f3745] rounded-[2px] pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 font-sans"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Filter Tabs */}
            <div className="flex gap-1 overflow-x-auto pt-2 pb-0.5 scrollbar-thin">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`hw-btn text-[10px] px-2 py-0.5 rounded-[2px] whitespace-nowrap transition cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'hw-btn-amber font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.label} ({cat.count})
                </button>
              ))}
            </div>
          </div>

          {/* Component Catalog Cards List */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
            {filteredTemplates.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                <p>No bench components match &ldquo;{searchQuery}&rdquo;</p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('ALL');
                  }}
                  className="mt-2 text-amber-400 underline text-[11px] cursor-pointer"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              filteredTemplates.map((template) => {
                const wasRecentlyAdded = recentlyAddedId === template.id;

                return (
                  <div
                    key={template.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, template)}
                    className="group bg-[#181c24] hover:bg-[#1d222c] border border-[#2d3543] hover:border-[#4b566a] rounded-[3px] p-3 transition cursor-grab active:cursor-grabbing"
                  >
                    {/* Top Row: Symbol Icon, Name, Badge */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-7 h-7 rounded-[2px] flex items-center justify-center shrink-0 border"
                          style={{
                            backgroundColor: `${template.colorHex}15`,
                            borderColor: `${template.colorHex}60`,
                            color: template.colorHex,
                          }}
                        >
                          <Zap className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold text-slate-100 truncate group-hover:text-amber-300 transition">
                            {template.name}
                          </h3>
                          <span
                            className="text-[9px] font-semibold tracking-wider uppercase block truncate"
                            style={{ color: template.colorHex }}
                          >
                            {template.badge}
                          </span>
                        </div>
                      </div>

                      {/* Quick Add Button */}
                      <button
                        onClick={() => handleAdd(template)}
                        className={`hw-btn shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-[2px] transition cursor-pointer ${
                          wasRecentlyAdded
                            ? 'hw-btn-green'
                            : 'text-slate-200 hover:text-amber-300'
                        }`}
                        title="Add to circuit canvas"
                      >
                        {wasRecentlyAdded ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Added!</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            <span>Add</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Description */}
                    <p className="text-[10px] text-slate-400 font-sans line-clamp-2 leading-relaxed mb-2">
                      {template.description}
                    </p>

                    {/* Practical Bench Role */}
                    <div className="bg-[#0e1117] rounded-[2px] p-1.5 border border-[#2a313d] text-[10px] text-slate-300 font-sans mb-2 flex items-start gap-1.5">
                      <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span className="leading-tight">{template.benchRole}</span>
                    </div>

                    {/* Pin Terminals Preview */}
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[9px] text-slate-500 uppercase mr-1">Terminals:</span>
                      {template.pins.map((pin) => (
                        <span
                          key={pin.idSuffix}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded-[2px] bg-[#0e1117] border border-[#2a313d] text-slate-300"
                          title={pin.description}
                        >
                          {pin.label}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        /* Placed Auxiliary Components List & Inspector */
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          {auxiliaryPlaced.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs">
              <Layers className="w-8 h-8 mx-auto mb-2 text-slate-600 opacity-60" />
              <p className="font-semibold text-slate-400">No Auxiliary Components Added</p>
              <p className="text-[11px] text-slate-500 mt-1 font-sans">
                Drag LEDs, pull-up resistors, or diodes from the Catalog tab into your bench circuit.
              </p>
              <button
                onClick={() => setActiveTab('LIBRARY')}
                className="hw-btn mt-3 px-3 py-1.5 rounded-[2px] text-amber-300 text-[11px] font-bold cursor-pointer"
              >
                Browse Component Catalog
              </button>
            </div>
          ) : (
            auxiliaryPlaced.map((comp) => {
              const isOpen = Boolean(comp.state?.isOpen);
              const wiperPct = (comp.state?.wiperPercent as number) ?? 50;

              return (
                <div
                  key={comp.id}
                  className="bg-[#181c24] border border-[#2d3543] rounded-[3px] p-2.5 shadow-sm space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{comp.name}</h4>
                      <span className="text-[9px] text-amber-400 uppercase">{comp.type}</span>
                    </div>
                    <button
                      onClick={() => onDeleteComponent(comp.id)}
                      className="p-1 rounded-[2px] text-rose-400 hover:text-white hover:bg-rose-950/60 transition cursor-pointer"
                      title="Delete component from bench"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Context controls based on component type */}
                  {comp.type === 'switch' && (
                    <div className="flex items-center justify-between hw-lcd-well p-1.5 rounded-[2px] text-[10px]">
                      <span className="text-slate-400">CONTACT STATE:</span>
                      <button
                        onClick={() => onUpdateComponentState(comp.id, { isOpen: !isOpen })}
                        className={`hw-btn flex items-center gap-1 px-2 py-0.5 rounded-[2px] font-bold transition cursor-pointer ${
                          isOpen ? 'hw-btn-amber' : 'hw-btn-green'
                        }`}
                      >
                        {isOpen ? (
                          <>
                            <ToggleLeft className="w-3.5 h-3.5 text-amber-400" />
                            <span>OPEN (Off)</span>
                          </>
                        ) : (
                          <>
                            <ToggleRight className="w-3.5 h-3.5 text-emerald-400" />
                            <span>CLOSED (On)</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {comp.type === 'potentiometer' && (
                    <div className="hw-lcd-well p-2 rounded-[2px] text-[10px]">
                      <RotaryEncoderDial
                        label="WIPER POSITION"
                        value={wiperPct}
                        min={0}
                        max={100}
                        step={1}
                        unit="%"
                        accent="steel"
                        size="sm"
                        inlineFlankButtons={{
                          dec: { label: '-5%', delta: -5 },
                          inc: { label: '+5%', delta: 5 },
                        }}
                        onChange={(nextVal) =>
                          onUpdateComponentState(comp.id, { wiperPercent: nextVal })
                        }
                      />
                    </div>
                  )}

                  {/* Connected Pin Terminals */}
                  <div className="text-[10px] text-slate-400 flex flex-wrap gap-1">
                    {comp.pins.map((p) => (
                      <span
                        key={p.id}
                        className="px-1.5 py-0.5 rounded-[2px] bg-[#0e1117] border border-[#2a313d] text-slate-300 text-[9px]"
                      >
                        {p.label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Footer Info */}
      <div className="p-2 border-t border-[#2a313d] bg-[#101319] text-[10px] text-slate-500 text-center flex items-center justify-between">
        <span>MNA Electrical Solver Active</span>
        <span className="text-emerald-400">Drag &amp; Drop Ready</span>
      </div>
    </aside>
  );
};
