import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  KeyRound,
  ShieldAlert,
  WifiOff,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import type { BilingualLang } from '../../types/aiAssistant';

export interface InteractiveQuickGuide {
  id: string;
  titleTL: string;
  titleEN: string;
  summaryTL: string;
  summaryEN: string;
  boldSafetyWarningTL?: string;
  boldSafetyWarningEN?: string;
  stepsTL: string[];
  stepsEN: string[];
  assistantFollowUpTL: string;
  assistantFollowUpEN: string;
}

export const INTERACTIVE_QUICK_GUIDES: readonly InteractiveQuickGuide[] = [
  {
    id: 'guide-pin-access',
    titleTL: '1. Paano mag-input ng Trial / Master Admin PIN?',
    titleEN: '1. How to enter a Trial or Master Admin PIN?',
    summaryTL: 'Mabilis na gabay sa pag-unlock ng AutoElectric Lab Pro workstation.',
    summaryEN: 'Quick guide to unlocking your AutoElectric Lab Pro workstation.',
    stepsTL: [
      'Sa Landing Screen o sa License / PIN button sa itaas, piliin ang Trial PIN (8-digit) o Master Admin PIN tab.',
      'I-type ang ibinigay na 8-digit PIN (hal. 1234-5678) at pindutin ang Verify / Unlock Bench.',
      'Kung expired na ang Trial PIN, gumagana pa rin ang local offline simulator habang hinihintay ang bagong PIN.',
    ],
    stepsEN: [
      'On the Landing Screen or top License / PIN button, select the 8-digit Trial PIN or Master Admin PIN tab.',
      'Enter your issued PIN cleanly and press Verify / Unlock Bench.',
      'If a Trial PIN expires, local bench tools remain accessible while online AI endpoints lock until renewed.',
    ],
    assistantFollowUpTL: 'Paano mag-verify ng bench setup pagkatapos mag-unlock?',
    assistantFollowUpEN: 'How do I verify my bench setup after unlocking?',
  },
  {
    id: 'guide-dmm-scope',
    titleTL: '2. Paano gamitin ang Multimeter at Oscilloscope?',
    titleEN: '2. How to use the Multimeter & Oscilloscope?',
    summaryTL: 'Tamang pagpili ng DMM mode (V_DC vs OHMS) at live waveform inspection.',
    summaryEN: 'Correct DMM mode selection (V_DC vs OHMS) and live waveform inspection.',
    boldSafetyWarningTL:
      'BABALA: Gamitin lamang ang OHMS / CONTINUITY mode kapag naka-OFF ang Bench Power Supply. Magla-lockout ang DMM kung susukat ng Ohms sa live +12V circuit.',
    boldSafetyWarningEN:
      'WARNING: Use OHMS / CONTINUITY mode ONLY when Bench Power Supply is OFF. The DMM triggers a safety lockout on live +12V circuits.',
    stepsTL: [
      'Ikabit muna ang Black (-) COM probe sa Chassis Ground (KL31).',
      'Para sa live voltage check (KL30 ~12.6V, VREF_5V ~5.00V, TPS_SIG ~1.30V), itakda ang DMM sa V_DC mode habang ON ang PSU.',
      'Para sa CKP, CMP, Injector, o CAN Bus signals, buksan ang Oscilloscope tab at piliin ang channel na gusto mong suriin.',
    ],
    stepsEN: [
      'Connect the Black (-) COM probe to Chassis Ground (KL31) first.',
      'For live voltage checks (KL30 ~12.6V, VREF_5V ~5.00V, TPS_SIG ~1.30V), keep DMM in V_DC mode with PSU ON.',
      'For CKP, CMP, Injector, or CAN Bus signals, open the Oscilloscope tab and select the target signal channel.',
    ],
    assistantFollowUpTL: 'Paano gamitin ang Multimeter at Oscilloscope sa CAN Bus 60 ohms?',
    assistantFollowUpEN: 'How do I use the Multimeter and Oscilloscope for a 60 ohm CAN Bus test?',
  },
  {
    id: 'guide-safe-wiring',
    titleTL: '3. Paano magkabit ng wire nang ligtas?',
    titleEN: '3. How to connect bench wires safely?',
    summaryTL: 'Iwasan ang pagkasira ng ECU sa pamamagitan ng tamang rail separation at continuity check.',
    summaryEN: 'Prevent ECU damage using strict rail separation and power-OFF continuity checks.',
    boldSafetyWarningTL:
      'KRITIKAL NA BABALA: HUWAG KAILANMAN ikakabit ang 12V Power Rail (KL30/KL15) sa 5V Sensor Rail (VREF_5V / TPS / ECT)! Palaging mag-SHORT-TO-GROUND CHECK (OHMS mode, PSU OFF) bago i-ON ang Power Supply.',
    boldSafetyWarningEN:
      'CRITICAL WARNING: NEVER connect a 12V Power Rail (KL30/KL15) to a 5V Sensor Rail (VREF_5V / TPS / ECT)! Always perform a SHORT-TO-GROUND CHECK (OHMS mode, PSU OFF) before powering up.',
    stepsTL: [
      'Siguraduhing naka-OFF ang Bench Power Supply bago magdagdag o magbago ng jumper wire sa Wiring Canvas.',
      'I-verify muna ang eksaktong ECU part number at pinout — huwag manghula ng wire color.',
      'Bago i-ON ang PSU, sukatin sa DMM OHMS mode ang KL30 (Pin 2) papuntang KL31 (Pin 1) upang makumpirmang walang dead short.',
      'Itakda ang Current Limit sa 1.5A – 2.0A sa unang power-up bago i-enable ang Output.',
    ],
    stepsEN: [
      'Keep Bench Power Supply OFF while adding or modifying any jumper wires on the Wiring Canvas.',
      'Confirm exact ECU part number and connector orientation — never guess pinouts or wire colors.',
      'Before enabling PSU Output, run a DMM OHMS short-to-ground check across KL30 (Pin 2) and KL31 (Pin 1).',
      'Set Current Limit conservatively (1.5A – 2.0A) on initial bring-up before turning Output ON.',
    ],
    assistantFollowUpTL: 'Paano magkabit ng KL30, KL15, KL31 at 5V VREF nang ligtas?',
    assistantFollowUpEN: 'How do I safely wire KL30, KL15, KL31, and 5V VREF?',
  },
  {
    id: 'guide-ocp-trip',
    titleTL: '4. Ano ang gagawin kapag nag-OCP Trip ang Power Supply?',
    titleEN: '4. What to do when the Power Supply triggers an OCP Trip?',
    summaryTL: 'Ligtas na recovery procedure kapag lumampas sa current limit ang circuit.',
    summaryEN: 'Safe recovery procedure when circuit draw exceeds the current protection limit.',
    boldSafetyWarningTL:
      'HUWAG TAASAN ANG AMPS / CURRENT LIMIT upang pilitin ang circuit na umandar! I-isolate muna ang short-to-ground bago ibalik ang kuryente.',
    boldSafetyWarningEN:
      'NEVER RAISE THE AMPS / CURRENT LIMIT to force a shorted circuit ON! Isolate the short-to-ground first before restoring power.',
    stepsTL: [
      'I-OFF agad ang Bench Power Supply Output.',
      'Buksan ang Fault Injection Matrix at Wiring Canvas para alisin ang anumang SHORT_TO_GND fault o maling +12V-to-GND jumper.',
      'Sukatin sa DMM OHMS mode ang Pin 2 (KL30) vs Pin 1 (KL31) para kumpirmahing nawala na ang short.',
      'I-reset at ibalik ang PSU Output sa 12.6V / 2.0A limit at i-verify na normal ang idle current draw.',
    ],
    stepsEN: [
      'Switch Bench Power Supply Output OFF immediately.',
      'Inspect the Fault Injection Matrix and Wiring Canvas to clear any SHORT_TO_GND fault or misrouted +12V-to-GND wire.',
      'Verify Pin 2 (KL30) to Pin 1 (KL31) resistance in DMM OHMS mode to confirm the short is cleared.',
      'Re-enable PSU Output at 12.6V with a 2.0A limit and confirm normal idle current draw.',
    ],
    assistantFollowUpTL: 'Nag-OCP Trip ang Power Supply ko, ano ang step-by-step check?',
    assistantFollowUpEN: 'My Power Supply tripped OCP, what is the step-by-step recovery check?',
  },
  {
    id: 'guide-offline-workshop',
    titleTL: '5. Paano gumagana ang Offline Mode sa talyer?',
    titleEN: '5. How does Offline Mode work in the workshop?',
    summaryTL: 'Walang signal sa talyer? Tuloy pa rin ang MNA simulator, 2,080+ PH scenarios, at Offline AI.',
    summaryEN: 'No shop internet? MNA simulation, 2,080+ PH scenarios, and Offline AI keep working.',
    stepsTL: [
      'Kapag nawalan ng internet o nag-quota limit ang online AI tiers (Carbon ➔ Hydrogen ➔ Argon ➔ Flash Lite), awtomatikong lilipat ang router sa Offline AI.',
      'Lahat ng high-confidence online diagnosis na na-verify noon ay awtomatikong naka-cache sa lokal na IndexedDB (AutoLabPro_VerifiedKnowledge).',
      'May 70% Confidence Score Gate ang Offline AI — kung hindi malinaw ang tanong, magtatanong ito ng paglilinaw sa halip na manghula.',
    ],
    stepsEN: [
      'When workshop internet drops or online tiers hit limits (Carbon ➔ Hydrogen ➔ Argon ➔ Flash Lite), the router seamlessly falls back to Offline AI.',
      'Previously verified high-confidence online diagnostics are automatically cached locally in IndexedDB (AutoLabPro_VerifiedKnowledge).',
      'Offline AI enforces a strict 70% Confidence Score Gate — unclear queries prompt for clarification instead of guessing.',
    ],
    assistantFollowUpTL: 'Paano gumagana ang Offline AI at 70% Score Gate sa P0122?',
    assistantFollowUpEN: 'How does Offline AI with the 70% Score Gate diagnose P0122?',
  },
] as const;

interface FloatingHelpDrawerProps {
  lang: BilingualLang;
  onAskAssistant?: (prompt: string) => void;
}

function getGuideIcon(id: string): React.ReactNode {
  switch (id) {
    case 'guide-pin-access':
      return <KeyRound className="w-4 h-4 text-cyan-400 shrink-0" />;
    case 'guide-dmm-scope':
      return <Wrench className="w-4 h-4 text-sky-400 shrink-0" />;
    case 'guide-safe-wiring':
      return <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />;
    case 'guide-ocp-trip':
      return <Zap className="w-4 h-4 text-amber-400 shrink-0" />;
    default:
      return <WifiOff className="w-4 h-4 text-emerald-400 shrink-0" />;
  }
}

export const FloatingHelpDrawer: React.FC<FloatingHelpDrawerProps> = ({
  lang,
  onAskAssistant,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string>(INTERACTIVE_QUICK_GUIDES[2].id);

  return (
    <>
      {/* Persistent Bottom-Right Floating Action Button */}
      <button
        type="button"
        data-testid="floating-help-fab"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-cyan-400/70 bg-[#0B172A]/95 hover:bg-cyan-950 px-3.5 py-2.5 text-cyan-100 shadow-lg shadow-cyan-950/60 transition-transform hover:scale-[1.02] cursor-pointer"
        aria-label={lang === 'TL' ? 'Gabay at Tulong' : 'Help & Guide'}
      >
        <HelpCircle className="w-4 h-4 text-cyan-300 shrink-0" />
        <span className="font-mono text-xs font-semibold">
          {lang === 'TL' ? 'Gabay at Tulong' : 'Help & Guide'}
        </span>
      </button>

      {/* Sliding Help Drawer */}
      {isOpen && (
        <div
          data-testid="floating-help-drawer"
          className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#070E1B] border-l border-slate-700/90 shadow-2xl flex flex-col text-slate-100"
          role="dialog"
          aria-modal="false"
          aria-label={lang === 'TL' ? 'Gabay at Tulong Drawer' : 'Help & Guide Drawer'}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B1528] shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-cyan-300" />
              <div>
                <h2 className="font-hud text-sm font-bold text-slate-100">
                  {lang === 'TL'
                    ? 'Gabay at Tulong — 5 Quick Guides'
                    : 'Help & Guide — 5 Quick Guides'}
                </h2>
                <p className="font-mono text-[10px] text-slate-400">
                  {lang === 'TL'
                    ? 'Taglish / English Beginner-Safe ECU Bench Manual'
                    : 'English / Taglish Beginner-Safe ECU Bench Manual'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-[3px] border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
              aria-label="Close Help Drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {INTERACTIVE_QUICK_GUIDES.map((guide) => {
              const isExpanded = expandedId === guide.id;
              const title = lang === 'TL' ? guide.titleTL : guide.titleEN;
              const summary = lang === 'TL' ? guide.summaryTL : guide.summaryEN;
              const warning =
                lang === 'TL' ? guide.boldSafetyWarningTL : guide.boldSafetyWarningEN;
              const steps = lang === 'TL' ? guide.stepsTL : guide.stepsEN;
              const followUp =
                lang === 'TL' ? guide.assistantFollowUpTL : guide.assistantFollowUpEN;

              return (
                <div
                  key={guide.id}
                  data-guide-id={guide.id}
                  className="rounded-[4px] border border-slate-800 bg-slate-900/75 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? '' : guide.id)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-800/70 transition-colors cursor-pointer"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getGuideIcon(guide.id)}
                      <span className="font-hud text-xs font-semibold text-slate-100 leading-snug">
                        {title}
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-slate-800/80 space-y-2.5 text-xs">
                      <p className="text-slate-400">{summary}</p>

                      {warning && (
                        <div className="rounded-[3px] border border-rose-500/60 bg-rose-950/50 p-2.5 flex items-start gap-2 text-rose-100">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <p className="font-bold leading-relaxed">{warning}</p>
                        </div>
                      )}

                      <ol className="list-decimal pl-4 space-y-1.5 text-slate-200 leading-relaxed">
                        {steps.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ol>

                      {onAskAssistant && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsOpen(false);
                            onAskAssistant(followUp);
                          }}
                          className="w-full mt-1 px-2.5 py-1.5 rounded-[3px] border border-cyan-500/50 bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-200 font-mono text-[11px] font-semibold cursor-pointer"
                        >
                          {lang === 'TL'
                            ? 'Itanong ito sa AI Bench Assistant →'
                            : 'Ask AI Bench Assistant about this →'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};
