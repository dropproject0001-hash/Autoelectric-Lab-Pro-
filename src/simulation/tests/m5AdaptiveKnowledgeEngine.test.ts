/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import {
  approveAdaptiveKnowledgeItem,
  captureAdaptiveKnowledge,
  listAdaptiveKnowledgeQueue,
  rejectOrSupersedeAdaptiveItem,
  resetAdaptiveKnowledgeEngineForTests,
  retrieveAdaptiveKnowledge,
} from '../../services/ai/adaptiveKnowledgeEngine';
import { resetAutomotiveKnowledgeCacheForTests } from '../../services/automotiveKnowledgeService';

function runM5AdaptiveKnowledgeTests(): void {
  console.log('\n=== M5 ADAPTIVE KNOWLEDGE ENGINE & ANTI-POISONING TEST SUITE ===');
  resetAdaptiveKnowledgeEngineForTests();
  resetAutomotiveKnowledgeCacheForTests();

  // 1. Captured AI answer enters as CAPTURED (never auto-verified) & strips chain-of-thought + PII
  const aiCapture = captureAdaptiveKnowledge({
    title: 'Denso 89661-0K555 Pin 12 VREF Spec',
    content:
      '<think>hidden reasoning chain</think> Pin 12 supplies 5.0V VREF Key-ON. Contact owner@shop.com.',
    origin: 'AI_ASSISTED_DRAFT',
    ecuIdentity: {
      manufacturer: 'Toyota',
      ecuModel: 'Denso ECM',
      partNumber: '89661-0K555',
      hardwareId: 'HW-A1',
      softwareId: 'SW-1.0',
    },
    sourceDocument: 'Workshop Session Draft',
    testConditions: 'IG-ON, Engine OFF',
    tags: ['vref', '89661-0k555'],
    actor: 'ai-orchestrator',
  });
  assert.equal(aiCapture.captured, true);
  assert.equal(aiCapture.item?.lifecycleStatus, 'CAPTURED', 'AI content must NEVER be auto-verified');
  assert.ok(!aiCapture.item?.content.includes('hidden reasoning'), 'Chain-of-thought must be stripped');
  assert.ok(!aiCapture.item?.content.includes('owner@shop.com'), 'PII must be stripped');
  console.log('  PASS: 1. AI capture stays CAPTURED (never auto-verified) with CoT & PII stripped');

  // 2. Captured/pending items are EXCLUDED from default retrieval, and badged UNVERIFIED when opted in
  const defaultHits = retrieveAdaptiveKnowledge({ query: '89661-0K555 VREF' });
  assert.equal(
    defaultHits.length,
    0,
    'Captured/unverified items MUST be excluded from default retrieval'
  );

  const optInHits = retrieveAdaptiveKnowledge({
    query: '89661-0K555 VREF',
    includeUnverified: true,
  });
  assert.equal(optInHits.length, 1);
  assert.equal(optInHits[0].badge, 'UNVERIFIED');
  assert.equal(optInHits[0].isUnverifiedOptIn, true);
  console.log('  PASS: 2. Unverified items excluded by default and clearly badged UNVERIFIED on opt-in');

  // 3. Duplicate detection catches identical or high-similarity captures
  const dupAttempt = captureAdaptiveKnowledge({
    title: 'Denso 89661-0K555 Pin 12 VREF Spec',
    content: 'Pin 12 supplies 5.0V VREF Key-ON. Contact [REDACTED_EMAIL].',
    origin: 'TECHNICIAN_SESSION_OUTCOME',
    ecuIdentity: {
      manufacturer: 'Toyota',
      ecuModel: 'Denso ECM',
      partNumber: '89661-0K555',
    },
    sourceDocument: 'Shop Notes',
    testConditions: 'IG-ON, Engine OFF',
    actor: 'tech-1',
  });
  assert.equal(dupAttempt.captured, false);
  assert.equal(dupAttempt.isDuplicate, true);
  assert.equal(dupAttempt.duplicateOfId, aiCapture.item?.id);
  console.log('  PASS: 3. Duplicate capture detected and prevented');

  // 4. Explicit approval promotes record to trusted status and enables default retrieval
  const nonAdminOemAttempt = approveAdaptiveKnowledgeItem({
    id: aiCapture.item!.id,
    targetStatus: 'VERIFIED',
    approverActor: 'tech-1',
    approverRole: 'TECHNICIAN',
  });
  assert.equal(nonAdminOemAttempt.ok, false, 'Only Admin can promote to VERIFIED OEM');

  const approved = approveAdaptiveKnowledgeItem({
    id: aiCapture.item!.id,
    targetStatus: 'TECHNICIAN_CONFIRMED',
    approverActor: 'tech-1',
    approverRole: 'TECHNICIAN',
    reviewNote: 'Verified on bench with calibrated DMM',
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.item?.lifecycleStatus, 'TECHNICIAN_CONFIRMED');
  assert.ok(approved.item?.indexedCatalogId, 'Approved record must be indexed into catalog');

  const trustedHits = retrieveAdaptiveKnowledge({ query: '89661-0K555 VREF' });
  assert.equal(trustedHits.length, 1);
  assert.equal(trustedHits[0].badge, 'TECHNICIAN CONFIRMED');
  console.log('  PASS: 4. Explicit approval promotes record to trusted status and indexes it');

  // 5. Conflict detection preserves BOTH records, flags conflict, and NEVER overwrites verified record
  const conflictCapture = captureAdaptiveKnowledge({
    title: 'Denso 89661-0K555 Pin 12 VREF Spec',
    content: 'Pin 12 supplies 12.6V VREF Key-ON.',
    origin: 'AI_ASSISTED_DRAFT',
    ecuIdentity: {
      manufacturer: 'Toyota',
      ecuModel: 'Denso ECM',
      partNumber: '89661-0K555',
      hardwareId: 'HW-B2',
      softwareId: 'SW-2.0',
    },
    sourceDocument: 'Unverified Forum Snippet',
    testConditions: 'Unknown ambient / unverified',
    actor: 'ai-orchestrator',
  });
  assert.equal(conflictCapture.captured, true);
  assert.equal(conflictCapture.conflictFlagged, true, 'Conflicting voltage must be flagged');
  assert.equal(conflictCapture.conflictDetail?.conflictingRecordId, aiCapture.item?.id);

  const queue = listAdaptiveKnowledgeQueue();
  assert.equal(queue.all.length, 2, 'Both existing and conflicting records must be preserved');
  assert.equal(queue.conflicts.length, 1);
  assert.equal(
    queue.trusted[0].content.includes('5.0V'),
    true,
    'Trusted 5.0V record must never be overwritten by unverified conflicting 12.6V record'
  );

  // Reject conflicting record cleanly
  const rejected = rejectOrSupersedeAdaptiveItem({
    id: conflictCapture.item!.id,
    targetStatus: 'REJECTED',
    actor: 'Master Admin',
    reason: '5V VREF cannot be 12.6V',
  });
  assert.equal(rejected.ok, true);
  assert.equal(rejected.item?.lifecycleStatus, 'REJECTED');
  resetAdaptiveKnowledgeEngineForTests();
  resetAutomotiveKnowledgeCacheForTests();
  console.log('  PASS: 5. Conflicting records are both preserved, compared, flagged, and never overwrite trusted data');

  console.log('\nM5 Adaptive Knowledge Engine Suite Summary: 5 passed, 0 failed\n');
}

runM5AdaptiveKnowledgeTests();
