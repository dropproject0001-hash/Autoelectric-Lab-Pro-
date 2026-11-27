/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  clearCachedWorkspaceAccessToken,
  getCachedWorkspaceAccessToken,
  GOOGLE_WORKSPACE_SCOPES,
  setCachedWorkspaceAccessToken,
} from '../../services/googleWorkspaceAuth';
import { resolveGooglePickerOrigin } from '../../services/googlePickerService';
import { buildClassroomLabSummary } from '../../services/googleClassroomService';
import { buildBenchInspectionFormTemplate } from '../../services/googleFormsService';
import { describePendingWorkspaceAction } from '../../components/workspace/WorkspaceAuthBanner';
import type { PendingWorkspaceAction } from '../../components/workspace/workspaceTypes';
import type { EcuPin, WireConnection } from '../../types/ecu';

const TEST_PINS: EcuPin[] = [
  {
    id: 'pin-3',
    pinNumber: 3,
    label: 'KL30',
    name: 'Battery Constant +12V',
    category: 'power',
    nominalVoltage: 12.6,
    internalResistance: 0.2,
    description: 'Constant battery feed',
  },
];

const TEST_WIRES: WireConnection[] = [
  {
    id: 'w-1',
    sourcePinId: 'bench-vbat',
    targetPinId: 'pin-3',
    label: 'KL30 Feed',
    color: '#ef4444',
    resistance: 0.05,
    isCut: false,
  },
];

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    throw err;
  }
}

async function main() {
  await runTest('1. GOOGLE_WORKSPACE_SCOPES includes all 7 Google Workspace product scopes without duplicates', () => {
    const unique = new Set(GOOGLE_WORKSPACE_SCOPES);
    assert.equal(unique.size, GOOGLE_WORKSPACE_SCOPES.length, 'Scopes must be deduplicated');
    assert.equal(GOOGLE_WORKSPACE_SCOPES.length, 58, 'Expected all 58 provisioned scopes');

    const requiredScopes = [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/classroom.courses',
      'https://www.googleapis.com/auth/classroom.announcements',
      'https://www.googleapis.com/auth/classroom.coursework.students',
      'https://www.googleapis.com/auth/forms.body',
      'https://www.googleapis.com/auth/forms.body.readonly',
      'https://www.googleapis.com/auth/forms.responses.readonly',
    ];
    for (const scope of requiredScopes) {
      assert.ok(unique.has(scope), `Missing required scope: ${scope}`);
    }
  });

  await runTest('2. Workspace OAuth access token cache is strictly in-memory and clears cleanly', () => {
    const authSrc = fs.readFileSync(path.resolve('src/services/googleWorkspaceAuth.ts'), 'utf8');
    const codeOnly = authSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.equal(codeOnly.includes('localStorage'), false, 'Must never access localStorage for OAuth tokens');
    assert.equal(codeOnly.includes('sessionStorage'), false, 'Must never access sessionStorage for OAuth tokens');
    assert.equal(codeOnly.includes('initializeApp'), false, 'Must reuse existing Firebase app from src/lib/firebase.ts');

    clearCachedWorkspaceAccessToken();
    assert.equal(getCachedWorkspaceAccessToken(), null);
    setCachedWorkspaceAccessToken('  ya29.test-token  ');
    assert.equal(getCachedWorkspaceAccessToken(), 'ya29.test-token');
    clearCachedWorkspaceAccessToken();
    assert.equal(getCachedWorkspaceAccessToken(), null);
  });

  await runTest('3. Google Picker resolves iframe ancestor origin and never uses a developer key', () => {
    const pickerSrc = fs.readFileSync(path.resolve('src/services/googlePickerService.ts'), 'utf8');
    assert.equal(pickerSrc.includes('setDeveloperKey'), false, 'Google Picker must never pass a developer key');
    assert.equal(pickerSrc.includes('setOAuthToken'), true, 'Google Picker must authorize via OAuth token');

    assert.equal(
      resolveGooglePickerOrigin({
        origin: 'https://inner-preview.example.com',
        ancestorOrigins: ['https://mid.example.com', 'https://aistudio.google.com'],
      }),
      'https://aistudio.google.com'
    );
    assert.equal(
      resolveGooglePickerOrigin({
        origin: 'http://localhost:3000',
        ancestorOrigins: [],
      }),
      'http://localhost:3000'
    );
  });

  await runTest('4. Google Classroom lab summary formats active DTCs and ECU telemetry', () => {
    const summary = buildClassroomLabSummary({
      ecuProfileLabel: 'Bosch MED17.5 4-Cyl EFI',
      powerSupply: {
        preset: '12V_BENCH',
        voltageSetting: 12.6,
        currentLimit: 3.0,
        isOutputEnabled: true,
      },
      pins: TEST_PINS,
      wires: TEST_WIRES,
      faults: [],
      multimeter: {
        isPowered: true,
        mode: 'V_DC',
        redProbe: { attachedToPinId: 'pin-3', attachedLabel: 'Pin 3 (KL30)' },
        blackProbe: { attachedToPinId: 'bench-gnd', attachedLabel: 'GND' },
        rangeAuto: true,
        holdValue: false,
      },
      circuitSolution: {
        nodeVoltages: { 'pin-3': 12.6 },
        nodeResistances: { 'pin-3': 0.2 },
        wireCurrentsMa: { 'w-1': 420 },
        supplyCurrentDrawAmps: 0.42,
        isSupplyCurrentTripped: false,
        multimeterReading: {
          value: 12.6,
          display: '12.60',
          unit: 'V',
          isOverLimit: false,
          isWarning: false,
          shouldBeep: false,
        },
        activeDTCs: [
          {
            code: 'P0201',
            system: 'Fuel',
            severity: 'CRITICAL',
            status: 'ACTIVE',
            associatedPinIds: ['ecu-pin-10'],
            description: 'Injector Circuit/Open - Cylinder 1',
          },
        ],
      },
    });

    assert.ok(summary.title.includes('Bosch MED17.5 4-Cyl EFI'));
    assert.ok(summary.title.includes('P0201'));
    assert.ok(summary.bodyText.includes('12.60 V'));
    assert.ok(summary.bodyText.includes('P0201'));
  });

  await runTest('5. Every mutating/destructive Google Workspace action produces a clear confirmation summary', () => {
    const sampleActions: PendingWorkspaceAction[] = [
      { kind: 'SEND_EMAIL', to: 'tech@example.com', cc: '', subject: 'Bench Report', bodyText: 'OK' },
      { kind: 'TRASH_EMAIL', messageId: 'm1', subject: 'Old Mail', from: 'a@b.com' },
      { kind: 'UPLOAD_DRIVE_FILE', name: 'bench.json', mimeType: 'application/json', content: '{}', previewText: '{}', description: 'Snapshot' },
      { kind: 'DELETE_DRIVE_FILE', fileId: 'f1', name: 'bench.json' },
      { kind: 'CREATE_GOOGLE_DOC', title: 'Report', bodyText: 'Telemetry' },
      { kind: 'TRASH_GOOGLE_DOC', documentId: 'd1', title: 'Report' },
      { kind: 'CREATE_TASK_ITEM', taskListId: 'tl1', taskListTitle: 'Lab', title: 'Check KL30', notes: '', dueIsoDate: '' },
      { kind: 'DELETE_TASK_ITEM', taskListId: 'tl1', taskId: 't1', taskTitle: 'Check KL30' },
      { kind: 'POST_CLASSROOM_ANNOUNCEMENT', courseId: 'c1', courseName: 'EFI 101', text: 'Lab ready' },
      { kind: 'CREATE_CLASSROOM_ASSIGNMENT', courseId: 'c1', courseName: 'EFI 101', title: 'Lab 1', description: 'Probe pin 3', maxPoints: 100 },
      {
        kind: 'CREATE_GOOGLE_FORM',
        title: 'ECU Bench Form',
        description: 'Bench test',
        questions: [{ title: 'KL30 Voltage', kind: 'SHORT_TEXT', required: true }],
      },
      {
        kind: 'ADD_FORM_QUESTION',
        formId: 'form-1',
        formTitle: 'ECU Bench Form',
        insertIndex: 0,
        question: { title: 'Injector Resistance', kind: 'SHORT_TEXT', required: true },
      },
      { kind: 'TRASH_GOOGLE_FORM', formId: 'form-1', title: 'ECU Bench Form' },
    ];

    for (const action of sampleActions) {
      const desc = describePendingWorkspaceAction(action);
      assert.ok(desc.title.length > 5, `Missing title for ${action.kind}`);
      assert.ok(desc.description.length > 10, `Missing description for ${action.kind}`);
      assert.ok(desc.confirmLabel.length > 3, `Missing confirmLabel for ${action.kind}`);
      assert.ok(desc.details.length >= 1, `Missing detail rows for ${action.kind}`);
    }

    assert.equal(describePendingWorkspaceAction(sampleActions[3]).isDestructive, true);
    assert.equal(describePendingWorkspaceAction(sampleActions[5]).isDestructive, true);
    assert.equal(describePendingWorkspaceAction(sampleActions[7]).isDestructive, true);
    assert.equal(describePendingWorkspaceAction(sampleActions[12]).isDestructive, true);
  });

  await runTest('6. Firebase project configuration and Firestore database ID are synchronized across config files', () => {
    const configPath = path.resolve('firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
      console.log('Skipping firebase-applet-config.json sync test (Firebase not yet provisioned in this environment)');
      return;
    }
    const appletConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      projectId: string;
      firestoreDatabaseId: string;
      oAuthClientId?: string;
    };
    const firebaseJson = JSON.parse(fs.readFileSync(path.resolve('firebase.json'), 'utf8')) as {
      firestore: { database: string };
    };
    const firebaserc = JSON.parse(fs.readFileSync(path.resolve('.firebaserc'), 'utf8')) as {
      projects: { default: string };
    };

    assert.equal(appletConfig.projectId, 'infra-firefly-1mln4');
    assert.equal(firebaserc.projects.default, appletConfig.projectId);
    assert.equal(firebaseJson.firestore.database, appletConfig.firestoreDatabaseId);
    assert.ok(appletConfig.oAuthClientId && appletConfig.oAuthClientId.includes('.apps.googleusercontent.com'));
  });

  await runTest('7. Google Forms service encodes formId safely and builds MNA inspection templates', () => {
    const formsSrc = fs.readFileSync(path.resolve('src/services/googleFormsService.ts'), 'utf8');
    assert.equal(formsSrc.includes('encodeURIComponent'), true, 'Google Forms service must URL-encode formId');

    const formTemplate = buildBenchInspectionFormTemplate({
      ecuProfileLabel: 'Bosch MED17.5 4-Cyl EFI',
      powerSupply: {
        preset: '12V_BENCH',
        voltageSetting: 12.6,
        currentLimit: 3.0,
        isOutputEnabled: true,
      },
      pins: TEST_PINS,
      wires: TEST_WIRES,
      faults: [],
      multimeter: {
        isPowered: true,
        mode: 'V_DC',
        redProbe: { attachedToPinId: 'pin-3', attachedLabel: 'Pin 3 (KL30)' },
        blackProbe: { attachedToPinId: 'bench-gnd', attachedLabel: 'GND' },
        rangeAuto: true,
        holdValue: false,
      },
      circuitSolution: {
        nodeVoltages: { 'pin-3': 12.6 },
        nodeResistances: { 'pin-3': 0.2 },
        wireCurrentsMa: { 'w-1': 420 },
        supplyCurrentDrawAmps: 0.42,
        isSupplyCurrentTripped: false,
        multimeterReading: {
          value: 12.6,
          display: '12.60',
          unit: 'V',
          isOverLimit: false,
          isWarning: false,
          shouldBeep: false,
        },
        activeDTCs: [
          {
            code: 'P0201',
            system: 'Fuel',
            severity: 'CRITICAL',
            status: 'ACTIVE',
            associatedPinIds: ['ecu-pin-10'],
            description: 'Injector Circuit/Open - Cylinder 1',
          },
        ],
      },
    });

    assert.ok(formTemplate.title.includes('Bosch MED17.5 4-Cyl EFI'));
    assert.ok(formTemplate.description.includes('12.60 V'));
    assert.ok(formTemplate.description.includes('P0201'));
    assert.ok(formTemplate.questions.length >= 4);
  });

  console.log('\nAll 7 Google Workspace & Firebase integration tests PASSED.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
