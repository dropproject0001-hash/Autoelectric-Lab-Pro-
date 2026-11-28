/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { WaveformCompareViewMode } from '../../simulation/signals/OemWaveformSynthesizer';
import { searchOscilloscopeWaveforms } from '../oscilloscopeWaveformKnowledgeService';
import type { OscilloscopeWaveformRecord } from '../../types/oscilloscopeWaveformIngestion';

export type ScopeVoiceAction =
  | { type: 'SET_VOLT_DIV'; voltDiv: number; spokenReply: string }
  | { type: 'SET_TIME_DIV'; timeDiv: number; spokenReply: string }
  | { type: 'SET_RPM'; rpm: number; spokenReply: string }
  | { type: 'SET_COMPARE_MODE'; mode: WaveformCompareViewMode; spokenReply: string }
  | { type: 'TOGGLE_RUN'; running: boolean; spokenReply: string }
  | { type: 'TOGGLE_PHOSPHOR'; enabled: boolean; spokenReply: string }
  | { type: 'LOAD_OEM_WAVEFORM'; record: OscilloscopeWaveformRecord; spokenReply: string }
  | { type: 'NONE' };

const ALLOWED_VOLT_STEPS = [0.2, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0];
const ALLOWED_TIME_STEPS = [0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0];

function snapToNearest(val: number, steps: number[]): number {
  return steps.reduce((best, curr) =>
    Math.abs(curr - val) < Math.abs(best - val) ? curr : best
  );
}

/**
 * Parses natural English & Taglish voice/text commands inside the OEM Oscilloscope
 * Reference Drawer so technicians can hands-free adjust voltage scale, timebase/speed,
 * RPM, run/hold state, phosphor persistence, Known-Good vs Faulty overlay, or load
 * any of the 118 PicoAuto OEM waveform guides by sensor name or DTC.
 */
export function parseScopeAndDrawerVoiceCommand(
  rawTranscript: string,
  currentState: {
    voltDiv: number;
    timeDiv: number;
    rpm: number;
    isRunning: boolean;
  }
): ScopeVoiceAction {
  const clean = rawTranscript.trim();
  const lower = clean.toLowerCase();
  if (!clean) return { type: 'NONE' };

  // 1. Run / Pause / Hold / Freeze
  if (/\b(?:pause|hold|freeze|stop\s+scope|ihinto|itigil)\b/i.test(lower)) {
    return {
      type: 'TOGGLE_RUN',
      running: false,
      spokenReply: 'Oscilloscope placed on HOLD so you can inspect the frozen capture.',
    };
  }
  if (/\b(?:resume|start\s+scope|run\s+scope|unfreeze|ituloy|patakbuhin)\b/i.test(lower)) {
    return {
      type: 'TOGGLE_RUN',
      running: true,
      spokenReply: 'Oscilloscope resumed in live RUNNING acquisition.',
    };
  }

  // 2. Phosphor persistence toggle
  if (
    /\bphosphor\b.*\b(?:off|disable|patayin)\b/i.test(lower) ||
    /\b(?:turn\s+off|disable|patayin)\b.*\bphosphor\b/i.test(lower)
  ) {
    return {
      type: 'TOGGLE_PHOSPHOR',
      enabled: false,
      spokenReply: 'Phosphor persistence turned OFF (pure 1.15px core beam).',
    };
  }
  if (
    /\bphosphor\b.*\b(?:on|enable|buksan)\b/i.test(lower) ||
    /\b(?:turn\s+on|enable|buksan)\b.*\bphosphor\b/i.test(lower)
  ) {
    return {
      type: 'TOGGLE_PHOSPHOR',
      enabled: true,
      spokenReply: 'Phosphor persistence turned ON.',
    };
  }

  // 3. Known-Good / Faulty / Overlay Compare mode switch
  if (/\b(?:overlay|compare|both|side\s*by\s*side|good\s*(?:and|vs)\s*faulty)\b/i.test(lower)) {
    return {
      type: 'SET_COMPARE_MODE',
      mode: 'OVERLAY',
      spokenReply: 'Switched OEM Reference scope to Overlay Compare (Known-Good vs Faulty dashed red).',
    };
  }
  if (/\b(?:show\s+faulty|faulty\s+(?:mode|signal|waveform)|sira|depektibo)\b/i.test(lower)) {
    return {
      type: 'SET_COMPARE_MODE',
      mode: 'FAULTY',
      spokenReply: 'Displaying Faulty signal comparison trace in LED red.',
    };
  }
  if (/\b(?:show\s+known[\s-]*good|good\s+(?:mode|signal|waveform)|normal\s+signal|maayos)\b/i.test(lower)) {
    return {
      type: 'SET_COMPARE_MODE',
      mode: 'GOOD',
      spokenReply: 'Displaying Known-Good OEM reference waveform.',
    };
  }

  // 4. Adjust Voltage / Volt-Div
  const voltMatch = lower.match(
    /(?:adjust|set|change|gawin|ilagay)?\s*(?:the\s+)?(?:volt(?:age|s)?(?:\s*\/\s*div|\s+per\s+div)?|v\/div|vertical\s+scale)\s*(?:to|sa|at|=)?\s*(\d+(?:\.\d+)?)\s*v?/i
  );
  if (voltMatch) {
    const target = snapToNearest(Number(voltMatch[1]), ALLOWED_VOLT_STEPS);
    return {
      type: 'SET_VOLT_DIV',
      voltDiv: target,
      spokenReply: `Adjusted oscilloscope vertical scale to ${target} V/div.`,
    };
  }

  // 5. Adjust Speed / Timebase / Time-Div
  const timeMatch = lower.match(
    /(?:adjust|set|change|gawin|ilagay)?\s*(?:the\s+)?(?:time(?:base|\s*\/\s*div|\s+per\s+div)?|t\/div|sweep|speed)\s*(?:to|sa|at|=)?\s*(\d+(?:\.\d+)?)\s*(?:ms|x)?/i
  );
  if (timeMatch) {
    const rawNum = Number(timeMatch[1]);
    const target = snapToNearest(rawNum, ALLOWED_TIME_STEPS);
    return {
      type: 'SET_TIME_DIV',
      timeDiv: target,
      spokenReply: `Adjusted oscilloscope timebase / sweep speed to ${target}x.`,
    };
  }
  if (/\b(?:faster\s+scope|speed\s+up|bilisan)\b/i.test(lower)) {
    const next = snapToNearest(currentState.timeDiv * 2, ALLOWED_TIME_STEPS);
    return {
      type: 'SET_TIME_DIV',
      timeDiv: next,
      spokenReply: `Increased oscilloscope sweep speed to ${next}x.`,
    };
  }
  if (/\b(?:slower\s+scope|slow\s+down|bagalan)\b/i.test(lower)) {
    const next = snapToNearest(currentState.timeDiv * 0.5, ALLOWED_TIME_STEPS);
    return {
      type: 'SET_TIME_DIV',
      timeDiv: next,
      spokenReply: `Slowed oscilloscope sweep speed to ${next}x.`,
    };
  }

  // 6. Adjust Simulated RPM
  const rpmMatch = lower.match(/(?:set|adjust|change|gawin)?\s*(?:the\s+)?rpm\s*(?:to|sa|at|=)?\s*(\d{3,4})/i);
  if (rpmMatch) {
    const clampedRpm = Math.max(0, Math.min(6000, Math.round(Number(rpmMatch[1]) / 50) * 50));
    return {
      type: 'SET_RPM',
      rpm: clampedRpm,
      spokenReply: `Adjusted simulated engine speed to ${clampedRpm} RPM.`,
    };
  }

  // 7. Load / Open / Show a specific OEM Waveform or DTC in the drawer
  const loadMatch = lower.match(
    /^(?:show|load|open|switch\s+to|display|tingnan|buksan|ipakita)\s+(?:me\s+)?(?:the\s+)?(.+)$/i
  );
  const dtcOnly = clean.toUpperCase().match(/\b[PBCU][0-3][0-9A-F]{3}\b/)?.[0];
  if (loadMatch || (dtcOnly && clean.length <= 16)) {
    const searchQuery = loadMatch ? loadMatch[1].replace(/\b(?:waveform|signal|oscilloscope|reference)\b/gi, '').trim() : dtcOnly!;
    if (searchQuery.length >= 2) {
      const hits = searchOscilloscopeWaveforms({
        query: searchQuery,
        dtcCode: dtcOnly,
      });
      if (hits.length > 0) {
        const rec = hits[0].record;
        return {
          type: 'LOAD_OEM_WAVEFORM',
          record: rec,
          spokenReply: `Loaded OEM reference ${rec.title} (${rec.agtCode}). Known-Good: ${rec.knownGood.waveformShape}.`,
        };
      }
    }
  }

  return { type: 'NONE' };
}
