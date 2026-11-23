import React, { useEffect, useRef, useState } from 'react';
import { MultimeterState, MultimeterMode, EcuPin, BenchComponent } from '../types/ecu';
import { Volume2, VolumeX, AlertTriangle, ArrowLeftRight, X, Disc, PauseCircle } from 'lucide-react';
import { playContinuityBeep, playHoldBeep } from '../utils/audioFeedback';
import { recordRenderCycle } from '../utils/perfMonitor';
import { RackCornerScrews } from './HardwareControls';

interface DigitalMultimeterProps {
  multimeter: MultimeterState;
  onChange: (updated: MultimeterState) => void;
  manualRangeLabel?: string | null;
  onClearManualRange?: () => void;
  reading: {
    display: string;
    value: number;
    unit: string;
    isOverLimit: boolean;
    isWarning: boolean;
    warningMessage?: string;
    shouldBeep: boolean;
  };
  pins: EcuPin[];
  components: BenchComponent[];
  selectedPinId: string | null;
}

const MODE_EXPLANATIONS: Record<MultimeterMode, { title: string; desc: string; usage: string }> = {
  V_DC: {
    title: 'DC Voltage (V DC)',
    desc: 'Measures steady Direct Current potential difference relative to Ground or reference chassis.',
    usage: 'Testing ECU power feeds (KL30/KL15), 5V reference rails (TPS/MAP), and ground voltage drops.',
  },
  V_AC: {
    title: 'AC Voltage (V AC~)',
    desc: 'Measures Alternating Current Root-Mean-Square (RMS) potential difference across active AC signals.',
    usage: 'Alternator diode AC ripple testing, wheel speed sensors, and Variable Reluctance (VR) crankshaft signals.',
  },
  RESISTANCE: {
    title: 'Resistance (Ω Ohms)',
    desc: 'Injects an internal test current to measure loop resistance. MUST be used with circuit Power OFF!',
    usage: 'Sensor thermistor resistance (ECT), injector coil resistance, CAN termination (60Ω), and harness corrosion.',
  },
  CONTINUITY: {
    title: 'Continuity Test (BEEP)',
    desc: 'Audible continuity test that beeps when loop resistance between probes is below 30 Ω.',
    usage: 'Verifying solid ground connections, tracing harness continuity, and detecting broken wires.',
  },
  FREQUENCY: {
    title: 'Frequency (Hz / % Duty Cycle)',
    desc: 'Measures signal switching frequency in Hertz and Pulse-Width Modulation (PWM) duty cycle percentage.',
    usage: 'Crankshaft/Camshaft Hall sensors, EVAP purge solenoid PWM, and fuel injector driver firing frequency.',
  },
  DIODE: {
    title: 'Diode Junction Test (-▷|-)',
    desc: 'Measures forward semiconductor PN-junction voltage drop (nominally 0.4V to 0.7V).',
    usage: 'Testing relay flyback suppression diodes, alternator rectifier bridges, and ECU ESD protection.',
  },
};

export const DigitalMultimeter: React.FC<DigitalMultimeterProps> = React.memo(({
  multimeter,
  onChange,
  manualRangeLabel = null,
  onClearManualRange,
  reading,
  pins,
  components,
}) => {
  useEffect(() => {
    recordRenderCycle('DigitalMultimeter');
  });

  const [hoveredMode, setHoveredMode] = useState<MultimeterMode | null>(null);
  const [beepEnabled, setBeepEnabled] = useState<boolean>(true);
  const [heldReading, setHeldReading] = useState<DigitalMultimeterProps['reading'] | null>(null);
  const [holdGlowActive, setHoldGlowActive] = useState<boolean>(false);
  const holdGlowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    return () => {
      if (holdGlowTimerRef.current) {
        clearTimeout(holdGlowTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!multimeter.isPowered || !multimeter.holdValue) {
      setHeldReading(null);
    }
  }, [multimeter.isPowered, multimeter.holdValue]);

  useEffect(() => {
    if (
      multimeter.isPowered &&
      beepEnabled &&
      multimeter.mode === 'CONTINUITY' &&
      reading.shouldBeep
    ) {
      playContinuityBeep(true);
    } else {
      playContinuityBeep(false);
    }

    return () => {
      playContinuityBeep(false);
    };
  }, [multimeter.isPowered, multimeter.mode, reading.shouldBeep, beepEnabled]);

  const triggerHoldGlow = () => {
    setHoldGlowActive(false);
    requestAnimationFrame(() => {
      setHoldGlowActive(true);
    });
    if (holdGlowTimerRef.current) {
      clearTimeout(holdGlowTimerRef.current);
    }
    holdGlowTimerRef.current = setTimeout(() => {
      setHoldGlowActive(false);
    }, 620);
  };

  const toggleHold = () => {
    if (!multimeter.isPowered) return;
    const nextHold = !multimeter.holdValue;
    if (nextHold) {
      setHeldReading(reading);
      triggerHoldGlow();
    } else {
      setHeldReading(null);
    }
    if (beepEnabled) {
      playHoldBeep(nextHold);
    }
    onChange({ ...multimeter, holdValue: nextHold });
  };

  const toggleBeep = () => {
    const nextBeep = !beepEnabled;
    setBeepEnabled(nextBeep);
    if (nextBeep && multimeter.isPowered) {
      playHoldBeep(true);
    }
  };

  const displayedReading =
    multimeter.holdValue && heldReading ? heldReading : reading;

  const setMode = (mode: MultimeterMode) => {
    onClearManualRange?.();
    onChange({ ...multimeter, mode, rangeAuto: true, holdValue: false });
  };

  const toggleRangeAuto = () => {
    const nextAuto = !multimeter.rangeAuto;
    if (nextAuto) {
      onClearManualRange?.();
    }
    onChange({ ...multimeter, rangeAuto: nextAuto });
  };

  const attachRedProbe = (pinId: string, label: string) => {
    onChange({
      ...multimeter,
      redProbe: { attachedToPinId: pinId, attachedLabel: label },
    });
  };

  const attachBlackProbe = (pinId: string, label: string) => {
    onChange({
      ...multimeter,
      blackProbe: { attachedToPinId: pinId, attachedLabel: label },
    });
  };

  const swapProbes = () => {
    onChange({
      ...multimeter,
      redProbe: multimeter.blackProbe,
      blackProbe: multimeter.redProbe,
    });
  };

  const clearProbes = () => {
    onChange({
      ...multimeter,
      redProbe: { attachedToPinId: null, attachedLabel: 'Unconnected' },
      blackProbe: { attachedToPinId: null, attachedLabel: 'Unconnected' },
    });
  };

  const allTerminals: { id: string; label: string; group: string }[] = [
    { id: 'chassis-gnd', label: 'Chassis Ground (KL31)', group: 'Reference Rails' },
    { id: 'bench-vbat', label: 'Power Supply (+12V VBat)', group: 'Reference Rails' },
    ...pins.map(p => ({ id: p.id, label: `${p.label} - ${p.name}`, group: 'ECU Breakout Header' })),
    ...components.flatMap(c =>
      c.pins.map(cp => ({ id: cp.id, label: `${c.name}: ${cp.label}`, group: 'Bench Components' }))
    ),
  ];

  const activeModeInfo = MODE_EXPLANATIONS[hoveredMode || multimeter.mode];

  return (
    <div className="relative hud-panel-amber rounded-xl p-3 flex flex-col gap-2.5 text-[#eaf3ff] shrink-0 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#ffb020]/45 to-transparent"
      />
      <RackCornerScrews />

      {/* Top Rack Module Header */}
      <div className="hud-panel-header flex items-center justify-between gap-2 pb-2 px-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className={`w-2 h-2 rounded-full shrink-0 ${
              multimeter.isPowered ? 'bg-[#ffb020] shadow-[0_0_6px_rgba(255,176,32,0.75)]' : 'bg-[#607694]'
            }`}
          />
          <span className="font-hud text-xs sm:text-sm font-bold tracking-wider text-[#ffb020] uppercase truncate">
            AUTO-DMM 88V
          </span>
          <span className="text-[9.5px] font-mono text-[#91a4bd] hidden sm:inline">
            BENCH MULTIMETER · SIM
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={toggleBeep}
            aria-pressed={beepEnabled}
            title={beepEnabled ? 'Simulated DMM Piezo Beep: ON' : 'Simulated DMM Piezo Beep: MUTED'}
            className={`hw-btn px-2 py-0.5 text-[9.5px] font-mono font-bold rounded-lg flex items-center gap-1 cursor-pointer ${
              beepEnabled ? 'text-[#eaf3ff] border-[#2d4b73]' : 'text-[#748aa8]'
            }`}
          >
            {beepEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            <span>{beepEnabled ? 'BEEP' : 'MUTE'}</span>
          </button>

          <button
            type="button"
            onClick={toggleHold}
            disabled={!multimeter.isPowered}
            aria-pressed={multimeter.holdValue}
            title={
              !multimeter.isPowered
                ? 'Power ON meter to use HOLD'
                : multimeter.holdValue
                ? 'Release HOLD'
                : 'Latch Current Reading (HOLD)'
            }
            className={`hw-btn px-2 py-0.5 text-[9.5px] font-mono font-bold rounded-lg flex items-center gap-1 ${
              !multimeter.isPowered
                ? 'opacity-45 cursor-not-allowed text-[#748aa8]'
                : multimeter.holdValue
                ? 'bg-[#ffb020] border-[#ffd47a] text-[#060b14] font-black cursor-pointer'
                : 'text-[#d4e3f6] hover:text-[#ffb020] cursor-pointer'
            }`}
          >
            <PauseCircle className="w-3 h-3" />
            <span>{multimeter.holdValue ? 'HOLD ON' : 'HOLD'}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onChange({
                ...multimeter,
                isPowered: !multimeter.isPowered,
                holdValue: !multimeter.isPowered ? multimeter.holdValue : false,
              })
            }
            className={`hw-btn px-2 py-0.5 text-[9.5px] font-mono font-bold rounded-lg cursor-pointer ${
              multimeter.isPowered ? 'hw-btn-green' : 'text-[#748aa8]'
            }`}
          >
            {multimeter.isPowered ? 'PWR ON' : 'PWR OFF'}
          </button>
        </div>
      </div>

      {/* Recessed Industrial LCD Screen */}
      <div className="hw-lcd-well p-1.5 rounded-xl">
        <div
          className={`bg-[#8d9d7b] border-2 rounded-lg p-2.5 text-slate-950 flex flex-col justify-between min-h-[86px] relative transition-colors duration-150 ${
            multimeter.holdValue ? 'border-[#ffb020]' : 'border-[#0a1220]'
          } ${holdGlowActive ? 'animate-dmm-hold-glow' : ''}`}
        >
          {multimeter.isPowered ? (
            <>
              <div className="flex justify-between items-center text-[9.5px] font-mono font-bold tracking-wider text-slate-900">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleRangeAuto}
                    title={
                      multimeter.rangeAuto
                        ? 'Auto-Range active (Click for Manual Range)'
                        : 'Manual Range active (Click to restore Auto-Range)'
                    }
                    className={`px-1 py-px rounded-[2px] border text-[9px] font-mono font-bold transition cursor-pointer ${
                      multimeter.rangeAuto
                        ? 'border-slate-800/40 bg-slate-900/10 text-slate-900 hover:bg-slate-900/20'
                        : 'border-slate-950 bg-slate-950 text-amber-300'
                    }`}
                  >
                    {multimeter.rangeAuto
                      ? 'AUTO'
                      : manualRangeLabel
                      ? `MAN ${manualRangeLabel}`
                      : 'MANUAL'}
                  </button>
                  {multimeter.mode === 'CONTINUITY' && (
                    beepEnabled ? (
                      <Volume2 className="w-3 h-3 text-slate-900" />
                    ) : (
                      <VolumeX className="w-3 h-3 text-slate-700" />
                    )
                  )}
                  {multimeter.mode === 'V_AC' && <span>AC~</span>}
                  {multimeter.mode === 'V_DC' && <span>DC</span>}
                  {multimeter.holdValue && (
                    <span
                      className={`px-1.5 py-px rounded-[2px] bg-slate-950 text-amber-300 text-[9px] font-black tracking-widest ${
                        holdGlowActive ? 'ring-2 ring-amber-400' : ''
                      }`}
                    >
                      HOLD
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[8.5px] px-1 rounded-[2px] bg-slate-900/15 border border-slate-800/40 font-black">
                    SIM · MNA
                  </span>
                  <span className="uppercase">{multimeter.mode.replace('_', ' ')}</span>
                </div>
              </div>

              <div className="flex items-baseline justify-end gap-2 my-0.5">
                <span className="text-3xl sm:text-4xl font-mono font-black tracking-tight tabular-nums text-slate-950">
                  {displayedReading.display}
                </span>
                <span className="text-base font-mono font-bold text-slate-900 w-10 text-left">
                  {displayedReading.unit}
                </span>
              </div>

              <div className="text-[9.5px] font-mono font-semibold text-slate-900 flex justify-between border-t border-slate-800/30 pt-1 truncate">
                <span className="truncate max-w-[150px]">+ RED: {multimeter.redProbe.attachedLabel}</span>
                <span className="truncate max-w-[150px]">- COM: {multimeter.blackProbe.attachedLabel}</span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-800/60 font-mono text-xs">
              [ METER POWERED OFF ]
            </div>
          )}
        </div>
      </div>

      {displayedReading.isWarning && displayedReading.warningMessage && (
        <div className="bg-rose-950/75 border border-rose-500/70 px-2.5 py-1.5 rounded-md flex items-start gap-2 text-[10.5px] text-rose-200 font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          <span>{displayedReading.warningMessage}</span>
        </div>
      )}

      {/* Tactile Mode Selector Push-Buttons */}
      <div
        className="grid grid-cols-6 gap-1 hw-lcd-well p-1.5 rounded-md relative"
        role="radiogroup"
        aria-label="Multimeter Measurement Mode Selector (Use Arrow Keys to Navigate)"
      >
        {(['V_DC', 'V_AC', 'RESISTANCE', 'CONTINUITY', 'FREQUENCY', 'DIODE'] as MultimeterMode[]).map((modeKey, idx, arr) => {
          const info = MODE_EXPLANATIONS[modeKey];
          const isSelected = multimeter.mode === modeKey;

          const tooltipAlignClass =
            idx === 0
              ? 'left-0 translate-x-0'
              : idx === 5
              ? 'right-0 translate-x-0'
              : 'left-1/2 -translate-x-1/2';

          const arrowAlignClass =
            idx === 0
              ? 'left-4 translate-x-0'
              : idx === 5
              ? 'right-4 translate-x-0'
              : 'left-1/2 -translate-x-1/2';

          const handleKeyDown = (e: React.KeyboardEvent) => {
            let targetIndex: number | null = null;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              targetIndex = (idx + 1) % arr.length;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              targetIndex = (idx - 1 + arr.length) % arr.length;
            } else if (e.key === 'Home') {
              e.preventDefault();
              targetIndex = 0;
            } else if (e.key === 'End') {
              e.preventDefault();
              targetIndex = arr.length - 1;
            }
            if (targetIndex !== null) {
              setMode(arr[targetIndex]);
              setHoveredMode(arr[targetIndex]);
              modeButtonRefs.current[targetIndex]?.focus();
            }
          };

          return (
            <div key={modeKey} className="relative group/btn flex flex-col items-center">
              <button
                ref={(el) => {
                  modeButtonRefs.current[idx] = el;
                }}
                role="radio"
                tabIndex={isSelected ? 0 : -1}
                aria-checked={isSelected}
                aria-label={`${info.title} measurement mode. ${info.desc}`}
                onClick={() => setMode(modeKey)}
                onMouseEnter={() => setHoveredMode(modeKey)}
                onMouseLeave={() => setHoveredMode(null)}
                onFocus={() => setHoveredMode(modeKey)}
                onBlur={() => setHoveredMode(null)}
                onKeyDown={handleKeyDown}
                className={`hw-btn w-full py-1.5 px-1 text-[9.5px] font-mono font-bold rounded-md focus:outline-none focus:ring-2 focus:ring-sky-400 flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  isSelected
                    ? 'hw-btn-blue font-black z-20'
                    : 'text-slate-300 hover:text-sky-200'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`w-3 h-0.5 rounded-full ${
                    isSelected ? 'bg-amber-400' : 'bg-[#2a3c59]'
                  }`}
                />

                <span className="flex items-center gap-0.5 whitespace-nowrap tracking-tight">
                  {modeKey === 'CONTINUITY' && <Volume2 className="w-2.5 h-2.5" />}
                  {modeKey === 'CONTINUITY'
                    ? 'BEEP'
                    : modeKey === 'RESISTANCE'
                    ? 'Ω OHM'
                    : modeKey === 'FREQUENCY'
                    ? 'Hz / %'
                    : modeKey === 'DIODE'
                    ? '-▷|-'
                    : modeKey === 'V_AC'
                    ? 'V AC~'
                    : 'V DC'}
                </span>
              </button>

              <div
                role="tooltip"
                className={`opacity-0 group-hover/btn:opacity-100 group-focus-within/btn:opacity-100 pointer-events-none absolute bottom-full mb-2 w-56 bg-[#0E192A] border border-[#19C8F5]/55 text-[#EAF3FF] text-[10px] p-2.5 rounded-xl shadow-2xl z-50 transition-opacity duration-150 font-sans ${tooltipAlignClass}`}
              >
                <div className="font-mono font-bold text-[#FFB020] border-b border-[#203653] pb-1 mb-1.5 flex items-center justify-between">
                  <span>{info.title}</span>
                  <span className="text-[9px] text-[#19C8F5] bg-[#132238] px-1.5 py-0.5 rounded border border-[#19C8F5]/40 font-mono">
                    {isSelected ? 'ACTIVE' : 'SELECT'}
                  </span>
                </div>
                <p className="text-[#91A4BD] text-[10.5px] leading-snug mb-1.5">{info.desc}</p>
                <div className="text-[9.5px] text-[#EAF3FF] font-mono bg-[#050A12] border border-[#203653] p-1.5 rounded-lg">
                  <strong className="text-[#FFB020]">Application:</strong> {info.usage}
                </div>
                <div className={`absolute top-full -mt-[1px] border-4 border-transparent border-t-[#19C8F5]/55 ${arrowAlignClass}`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Mode Telemetry & Student Guide Note */}
      <div className="hw-lcd-well rounded-xl p-2.5 font-sans text-[10.5px] flex flex-col gap-1">
        <div className="flex items-center justify-between font-mono text-[9.5px]">
          <span className="text-[#19c8f5] font-bold tracking-wide uppercase">
            {activeModeInfo.title}
          </span>
          <span className="text-[#7c93b2] text-[9px] font-mono">LAB GUIDE</span>
        </div>
        <p className="text-[#d4e3f6] text-[10.5px] leading-snug">{activeModeInfo.desc}</p>
        <div className="text-[9.5px] text-[#91a4bd] font-mono pt-1 border-t border-[#203653]/80 mt-0.5">
          <strong className="text-[#eaf3ff]">Application:</strong> {activeModeInfo.usage}
        </div>
      </div>

      {/* Probe Lead Jacks */}
      <div className="flex flex-col gap-1.5 pt-2 border-t border-[#203653]/85">
        <div className="flex items-center justify-between text-[10.5px] font-mono">
          <span className="text-[#91a4bd] uppercase tracking-wider">Probe Leads</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={swapProbes}
              className="hw-btn text-[9.5px] font-mono text-[#d4e3f6] hover:text-white flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer"
            >
              <ArrowLeftRight className="w-3 h-3" /> Swap
            </button>
            <button
              type="button"
              onClick={clearProbes}
              className="hw-btn text-[9.5px] font-mono text-[#91a4bd] hover:text-[#ff8594] flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer"
            >
              <X className="w-3 h-3" /> Disconnect
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="hud-subwell border-[#ff4d62]/50 p-2 rounded-xl flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="font-bold text-[#ff8594] flex items-center gap-1">
                <Disc className="w-3 h-3 text-[#ff4d62] fill-[#ff4d62]" /> (+) RED PROBE
              </span>
            </div>
            <select
              value={multimeter.redProbe.attachedToPinId || ''}
              onChange={e => {
                const target = allTerminals.find(t => t.id === e.target.value);
                if (target) attachRedProbe(target.id, target.label);
              }}
              className="w-full min-h-[34px] bg-[#0e192a] border border-[#203653] rounded-lg px-2 py-1 text-[10px] text-[#eaf3ff] focus:outline-none focus:border-[#ff4d62] cursor-pointer"
            >
              <option value="">-- Choose Terminal --</option>
              {allTerminals.map(t => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="hud-subwell p-2 rounded-xl flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="font-bold text-[#d4e3f6] flex items-center gap-1">
                <Disc className="w-3 h-3 text-[#91a4bd] fill-[#91a4bd]" /> (-) BLACK COM
              </span>
            </div>
            <select
              value={multimeter.blackProbe.attachedToPinId || ''}
              onChange={e => {
                const target = allTerminals.find(t => t.id === e.target.value);
                if (target) attachBlackProbe(target.id, target.label);
              }}
              className="w-full min-h-[34px] bg-[#0e192a] border border-[#203653] rounded-lg px-2 py-1 text-[10px] text-[#eaf3ff] focus:outline-none focus:border-[#19c8f5] cursor-pointer"
            >
              <option value="">-- Choose Terminal --</option>
              {allTerminals.map(t => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
});
