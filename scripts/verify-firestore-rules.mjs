import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();

function readJson(relPath) {
  const fullPath = path.join(rootDir, relPath);
  const raw = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(raw);
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const rulesPath = path.join(rootDir, 'firestore.rules');
  const blueprintPath = path.join(rootDir, 'firebase-blueprint.json');
  const firebaseJsonPath = path.join(rootDir, 'firebase.json');
  const appletConfigPath = path.join(rootDir, 'firebase-applet-config.json');

  assertCondition(fs.existsSync(rulesPath), 'Missing firestore.rules');
  assertCondition(fs.existsSync(blueprintPath), 'Missing firebase-blueprint.json');
  assertCondition(fs.existsSync(firebaseJsonPath), 'Missing firebase.json');

  const rulesSource = fs.readFileSync(rulesPath, 'utf8');
  const blueprint = readJson('firebase-blueprint.json');
  const firebaseConfig = readJson('firebase.json');

  assertCondition(
    rulesSource.includes("rules_version = '2';"),
    "firestore.rules must specify rules_version = '2';"
  );
  assertCondition(
    /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/.test(rulesSource),
    'firestore.rules must include default-deny catch-all rule'
  );
  assertCondition(
    !/allow\s+(read|write|read,\s*write)\s*:\s*if\s+true\b/.test(rulesSource),
    'firestore.rules contains forbidden wildcard allow-true rule'
  );

  for (const helper of ['isSignedIn()', 'isVerified()', 'isOwner(', 'isValidId(', 'isValidFaultSequence(']) {
    assertCondition(rulesSource.includes(helper), `firestore.rules missing required helper: ${helper}`);
  }

  assertCondition(
    rulesSource.includes('data.title.size() <= 100'),
    'firestore.rules must enforce 100-char limit on FaultSequence title (data.title.size() <= 100)'
  );
  assertCondition(
    rulesSource.includes('ownsFaultSequenceExisting(') && rulesSource.includes('ownsFaultSequenceAfter('),
    'firestore.rules must protect FaultSequence subcollections with parent ownership helpers'
  );

  const requiredSegments = [
    'match /users/{userId}',
    'match /benchSessions/{sessionId}',
    'match /wires/{wireId}',
    'match /faults/{faultId}',
    'match /componentStates/{componentId}',
    'match /diagnosticLogs/{logId}',
    'match /sources/{sourceId}',
    'match /pcbScans/{scanId}',
    'match /components/{componentId}',
    'match /nets/{netId}',
    'match /hotspots/{hotspotId}',
    'match /benchPreferences/{prefId}',
    'match /voiceMacros/{macroId}',
    'match /faultSequences/{sequenceId}',
    'match /stages/{stageId}',
    'match /items/{itemId}',
  ];

  for (const seg of requiredSegments) {
    assertCondition(rulesSource.includes(seg), `firestore.rules missing match block: ${seg}`);
  }

  const blueprintCollections = Object.keys(blueprint.firestore || {});
  assertCondition(
    blueprintCollections.includes('/users/{userId}/faultSequences/{sequenceId}') &&
      blueprintCollections.includes('/users/{userId}/faultSequences/{sequenceId}/stages/{stageId}') &&
      blueprintCollections.includes('/users/{userId}/faultSequences/{sequenceId}/items/{itemId}'),
    'firebase-blueprint.json is missing faultSequences or its /stages and /items subcollections'
  );

  const configuredDb = firebaseConfig?.firestore?.database;
  assertCondition(Boolean(configuredDb), 'firebase.json firestore.database must be specified');
  assertCondition(
    firebaseConfig?.firestore?.rules === 'firestore.rules',
    'firebase.json firestore.rules must point to firestore.rules'
  );

  if (fs.existsSync(appletConfigPath)) {
    const appletConfig = readJson('firebase-applet-config.json');
    if (appletConfig?.firestoreDatabaseId) {
      assertCondition(
        appletConfig.firestoreDatabaseId === configuredDb,
        `Database mismatch: firebase.json (${configuredDb}) vs firebase-applet-config.json (${appletConfig.firestoreDatabaseId})`
      );
    }
  }

  const eslintBin = path.join(rootDir, 'node_modules', '.bin', 'eslint');
  const lintRun = fs.existsSync(eslintBin)
    ? spawnSync(eslintBin, ['firestore.rules'], { stdio: 'inherit' })
    : spawnSync('npx', ['--no-install', 'eslint', 'firestore.rules'], { stdio: 'inherit' });

  if (lintRun.status !== 0) {
    throw new Error(`ESLint security-rules check failed with exit code ${lintRun.status}`);
  }

  console.log(
    `Verified firestore.rules (${blueprintCollections.length} blueprint collections, DB: ${configuredDb}) and passed @firebase/eslint-plugin-security-rules.`
  );
}

main();
