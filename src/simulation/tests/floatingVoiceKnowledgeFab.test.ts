/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  approveKnowledgeEntry,
  clearVerifiedKnowledgeStoreForTests,
  getKnowledgeCenterStats,
  saveVerifiedKnowledgeEntry,
  searchLocalFirstKnowledge,
  subscribeVerifiedKnowledgeUpdates,
} from '../../services/ai/localKnowledgeDB';
import { queryAiDiagnosticRouter } from '../../services/ai/aiRouter';
import type { BenchTelemetry } from '../../types/aiAssistant';

const SAMPLE_TELEMETRY: BenchTelemetry = {
  vehicleLabel: 'Universal 4-Cyl EFI',
  ecuProfileLabel: 'Universal 16-Pin EFI ECU',
  psuEnabled: true,
  psuVoltageSetting: 12.6,
  psuCurrentLimitAmps: 5,
  psuCurrentDrawAmps: 0.42,
  isOcpTripped: false,
  activeDtcs: [{ code: 'P0122', severity: 'WARNING', description: 'TPS Circuit Low Input' }],
  activeFaults: [],
  dmm: {
    isPowered: true,
    mode: 'V_DC',
    displayReading: '0.18',
    unit: 'V',
    redProbeLabel: 'TPS_SIG (Pin 7)',
    blackProbeLabel: 'Chassis GND (KL31)',
  },
};

test('subscribeVerifiedKnowledgeUpdates notifies listeners on save and approve and unsubscribes cleanly', async () => {
  await clearVerifiedKnowledgeStoreForTests();

  let notifications = 0;
  const unsubscribe = subscribeVerifiedKnowledgeUpdates(() => {
    notifications += 1;
  });

  const saved = await saveVerifiedKnowledgeEntry({
    lang: 'EN',
    originalQuestion: 'How do I verify 5V VREF stability on Pin 5?',
    subject: '5V VREF Pin 5 Verification',
    tokens: ['vref', 'pin5', '5v', 'stability'],
    rawAnswer: 'Measure Pin 5 to SGND with DMM in V_DC; expected 5.00V ± 0.15V.',
    safetyWarning: 'Do not short 5V VREF to 12V KL30.',
    rootCauseSummary: '5V LDO regulator feeds TPS/MAP sensors via Pin 5.',
    verificationStep: 'Backprobe Pin 5 against SGND with key ON; verify 4.85V to 5.15V.',
    confidence: 0.92,
    sourceTier: 'CARBON',
    ecuProvenanceTier: 'UNIVERSAL_TRAINER',
    references: ['Universal 16-Pin EFI Trainer Guide'],
  });

  assert.equal(saved.saved, true);
  assert.ok(saved.record?.id);
  assert.equal(notifications, 1);

  const approved = await approveKnowledgeEntry(saved.record!.id, 'Verified on bench');
  assert.equal(approved?.reviewStatus, 'APPROVED');
  assert.equal(notifications, 2);

  unsubscribe();
  await clearVerifiedKnowledgeStoreForTests();
  assert.equal(notifications, 2, 'Unsubscribed listener must not fire again');
});

test('local-first knowledge lookup serves verified offline records before online fallback', async () => {
  await clearVerifiedKnowledgeStoreForTests();

  await saveVerifiedKnowledgeEntry({
    lang: 'TL',
    originalQuestion: 'Paano i-check ang CAN Bus 60 Ohm resistance?',
    subject: 'CAN Bus 60 Ohm Termination Check',
    tokens: ['can', '60ohm', 'resistance', 'bus'],
    rawAnswer: 'I-OFF ang PSU bago sukatin ang resistance sa pagitan ng CAN_H at CAN_L; dapat ~60 Ohms.',
    safetyWarning: 'Ensure PSU is OFF before measuring resistance across CAN_H and CAN_L.',
    rootCauseSummary: 'Two parallel 120 Ohm terminators create 60 Ohms across CAN_H and CAN_L.',
    verificationStep: 'Turn PSU OFF, connect DMM Ohms across Pin 13 and Pin 14, verify 58-62 Ohms.',
    confidence: 0.94,
    sourceTier: 'CARBON',
    ecuProvenanceTier: 'UNIVERSAL_TRAINER',
    references: ['ISO 11898 CAN Standard'],
  });

  const localHit = await searchLocalFirstKnowledge({
    query: 'Ano resistance ng CAN bus termination?',
    lang: 'TL',
  });
  assert.ok(localHit, 'Expected semantic local knowledge hit');
  assert.equal(localHit?.record.subject, 'CAN Bus 60 Ohm Termination Check');

  const offlineRes = await queryAiDiagnosticRouter({
    query: 'Ano resistance ng CAN bus termination?',
    lang: 'TL',
    telemetry: SAMPLE_TELEMETRY,
    forceOffline: true,
  });
  assert.equal(offlineRes.tierUsed, 'OFFLINE_AI');
  assert.equal(offlineRes.sourceProvenance, 'LOCAL_VERIFIED_CACHE');
  assert.ok(offlineRes.conversationalSummary.includes('60'));

  const stats = await getKnowledgeCenterStats();
  assert.ok(stats.totalRecords >= 1);
  assert.ok(stats.totalReuseHits >= 1);

  await clearVerifiedKnowledgeStoreForTests();
});

test('UI wiring exposes FloatingVoiceKnowledgeFab, 3-tab UnifiedAiAssistantDrawer, and shared KnowledgeCenterPanel', () => {
  const root = process.cwd();
  const appSrc = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
  const fabSrc = fs.readFileSync(path.join(root, 'src/components/ai/FloatingVoiceKnowledgeFab.tsx'), 'utf8');
  const drawerSrc = fs.readFileSync(path.join(root, 'src/components/ai/UnifiedAiAssistantDrawer.tsx'), 'utf8');
  const modalSrc = fs.readFileSync(path.join(root, 'src/components/OfflineAssistantModal.tsx'), 'utf8');
  const voiceHookSrc = fs.readFileSync(path.join(root, 'src/hooks/useHandsFreeVoice.ts'), 'utf8');

  assert.ok(appSrc.includes('<FloatingVoiceKnowledgeFab'));
  assert.ok(appSrc.includes('setUnifiedAiSubTab(subTab)'));
  assert.ok(fabSrc.includes('floating-voice-knowledge-fab'));
  assert.ok(fabSrc.includes('floating-fab-quick-mic'));
  assert.ok(fabSrc.includes('floating-fab-knowledge-btn'));
  assert.ok(fabSrc.includes('subscribeVerifiedKnowledgeUpdates'));

  assert.ok(drawerSrc.includes("'VOICE' | 'DIAGNOSTIC' | 'KNOWLEDGE_DB'"));
  assert.ok(drawerSrc.includes('drawer-tab-knowledge-db'));
  assert.ok(drawerSrc.includes('<KnowledgeCenterPanel'));
  assert.equal(drawerSrc.includes('fixed inset-0'), false);

  assert.ok(modalSrc.includes('<KnowledgeCenterPanel'));
  assert.ok(voiceHookSrc.includes('subscribeVerifiedKnowledgeUpdates'));
});
