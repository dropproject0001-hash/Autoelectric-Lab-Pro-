/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const args = new Set(process.argv.slice(2));
const isQuick = args.has('--quick');
const skipBuild = isQuick || args.has('--skip-build');
const skipTests = isQuick || args.has('--skip-tests');
const allowMissingAppletConfig = args.has('--allow-missing-applet-config');

const EXPECTED_PROJECT_ID = 'infra-firefly-1mln4';
const EXPECTED_DATABASE_ID = 'ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const results = [];

function recordGate(name, status, detail, durationMs) {
  results.push({ name, status, detail, durationMs });
  const icon = status === 'PASS' ? '[PASS]' : status === 'WARN' ? '[WARN]' : status === 'SKIP' ? '[SKIP]' : '[FAIL]';
  const secs = (durationMs / 1000).toFixed(2);
  console.log(`${icon} ${name} (${secs}s) — ${detail}`);
}

function readJson(relPath) {
  const fullPath = path.join(rootDir, relPath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function runProcess(cmd, cmdArgs, options = {}) {
  return spawnSync(cmd, cmdArgs, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
}

function gate1SecretAndIgnoreHygiene() {
  const start = Date.now();
  const gitignorePath = path.join(rootDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    recordGate('1. Secret & .gitignore Hygiene', 'FAIL', 'Missing .gitignore file', Date.now() - start);
    return false;
  }

  const gitignore = fs.readFileSync(gitignorePath, 'utf8');
  const requiredIgnoreRules = [
    'node_modules/',
    'dist/',
    '.env*',
    '!.env.example',
    '.data/',
    '.aistudio/',
    'public/assets/aistudio/',
    'firebase-applet-config.json',
  ];

  const missingRules = requiredIgnoreRules.filter((rule) => !gitignore.includes(rule));
  if (missingRules.length > 0) {
    recordGate(
      '1. Secret & .gitignore Hygiene',
      'FAIL',
      `Missing .gitignore entries: ${missingRules.join(', ')}`,
      Date.now() - start
    );
    return false;
  }

  // Construct regexes dynamically so this script does not trigger literal scanners
  const secretDetectors = [
    { label: 'Google API key', re: new RegExp('AI' + 'za[0-9A-Za-z_-]{20,}') },
    { label: 'OpenAI/secret key', re: new RegExp('sk' + '-[0-9A-Za-z]{20,}') },
    { label: 'GitHub PAT', re: new RegExp('gh' + 'p_[0-9A-Za-z]{20,}') },
    { label: 'Private key block', re: new RegExp('-----BEGIN ' + '(RSA |EC )?PRIVATE KEY-----') },
  ];

  const findings = [];
  const scanFile = (fullPath) => {
    const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const detector of secretDetectors) {
      if (detector.re.test(content)) {
        findings.push(`${rel} (${detector.label})`);
      }
    }
  };

  const scanDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) return;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
        scanDir(full);
      } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        scanFile(full);
      }
    }
  };

  scanDir(path.join(rootDir, 'src'));
  scanDir(path.join(rootDir, 'scripts'));
  const serverPath = path.join(rootDir, 'server.ts');
  if (fs.existsSync(serverPath)) {
    scanFile(serverPath);
  }

  if (findings.length > 0) {
    recordGate(
      '1. Secret & .gitignore Hygiene',
      'FAIL',
      `Potential hardcoded secret(s): ${findings.join('; ')}`,
      Date.now() - start
    );
    return false;
  }

  recordGate(
    '1. Secret & .gitignore Hygiene',
    'PASS',
    'All required .gitignore rules present; zero hardcoded secrets detected in src/, scripts/, server.ts',
    Date.now() - start
  );
  return true;
}

function gate2GitTrackingAndBranchGuard() {
  const start = Date.now();
  const gitCheck = runProcess('git', ['rev-parse', '--is-inside-work-tree'], { capture: true });
  if (gitCheck.status !== 0 || String(gitCheck.stdout || '').trim() !== 'true') {
    recordGate(
      '2. Git Tracking & Branch Guard',
      'SKIP',
      'Workspace is not inside a .git repository yet (will enforce automatically once synced into your GitHub repo)',
      Date.now() - start
    );
    return true;
  }

  const forbiddenTracked = [
    '.env',
    '.env.local',
    '.env.production',
    '.env.development',
    'firebase-applet-config.json',
    '.data',
    '.aistudio',
  ];

  const allowedAistudioBranding = new Set([
    'public/assets/aistudio/1795727293849_0b38d1ff.jpg',
    'public/assets/aistudio/1795699079803_96e28eb3.jpg',
    'public/assets/aistudio/1795699656648_ba33be6d.jpg',
    'public/assets/aistudio/1795701476178_14294533.jpg',
    'public/assets/aistudio/1795701471877_2efeb92c.jpg',
    'public/assets/aistudio/1795701467304_07225485.jpg',
  ]);

  const trackedRun = runProcess('git', ['ls-files', '--', ...forbiddenTracked, 'public/assets/aistudio'], { capture: true });
  const stagedRun = runProcess('git', ['diff', '--cached', '--name-only', '--', ...forbiddenTracked, 'public/assets/aistudio'], { capture: true });

  const trackedLeaks = String(trackedRun.stdout || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((file) => file && !allowedAistudioBranding.has(file));
  const stagedLeaks = String(stagedRun.stdout || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((file) => file && !allowedAistudioBranding.has(file));

  const leaks = Array.from(new Set([...trackedLeaks, ...stagedLeaks]));
  if (leaks.length > 0) {
    recordGate(
      '2. Git Tracking & Branch Guard',
      'FAIL',
      `Restricted files are tracked or staged in Git: ${leaks.join(', ')}. Unstage/untrack with "git rm --cached <file>" before pushing.`,
      Date.now() - start
    );
    return false;
  }

  const branchRun = runProcess('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { capture: true });
  const branchName = String(branchRun.stdout || '').trim() || 'unknown';
  if (branchName === 'main' || branchName === 'master') {
    recordGate(
      '2. Git Tracking & Branch Guard',
      'WARN',
      `No restricted files tracked/staged, but HEAD is directly on "${branchName}". Prefer merging via a release branch + PR.`,
      Date.now() - start
    );
    return true;
  }

  recordGate(
    '2. Git Tracking & Branch Guard',
    'PASS',
    `On branch "${branchName}"; zero restricted secrets tracked or staged`,
    Date.now() - start
  );
  return true;
}

function gate3FirebaseAlignment() {
  const start = Date.now();
  try {
    const firebaserc = readJson('.firebaserc');
    const firebaseJson = readJson('firebase.json');

    const rcProject = firebaserc?.projects?.default;
    if (rcProject !== EXPECTED_PROJECT_ID) {
      recordGate(
        '3. Firebase Project & DB Alignment',
        'FAIL',
        `.firebaserc default project is "${rcProject}", expected "${EXPECTED_PROJECT_ID}"`,
        Date.now() - start
      );
      return false;
    }

    const jsonDb = firebaseJson?.firestore?.database;
    if (jsonDb !== EXPECTED_DATABASE_ID) {
      recordGate(
        '3. Firebase Project & DB Alignment',
        'FAIL',
        `firebase.json firestore.database is "${jsonDb}", expected "${EXPECTED_DATABASE_ID}"`,
        Date.now() - start
      );
      return false;
    }

    if (firebaseJson?.firestore?.rules !== 'firestore.rules') {
      recordGate(
        '3. Firebase Project & DB Alignment',
        'FAIL',
        'firebase.json firestore.rules must point to "firestore.rules"',
        Date.now() - start
      );
      return false;
    }

    if (firebaseJson?.firestore?.indexes !== 'firestore.indexes.json') {
      recordGate(
        '3. Firebase Project & DB Alignment',
        'FAIL',
        'firebase.json firestore.indexes must point to "firestore.indexes.json"',
        Date.now() - start
      );
      return false;
    }

    const appletConfigPath = path.join(rootDir, 'firebase-applet-config.json');
    if (fs.existsSync(appletConfigPath)) {
      const appletConfig = readJson('firebase-applet-config.json');
      if (appletConfig?.projectId !== EXPECTED_PROJECT_ID) {
        recordGate(
          '3. Firebase Project & DB Alignment',
          'FAIL',
          `firebase-applet-config.json projectId is "${appletConfig?.projectId}", expected "${EXPECTED_PROJECT_ID}"`,
          Date.now() - start
        );
        return false;
      }
      if (appletConfig?.firestoreDatabaseId !== EXPECTED_DATABASE_ID) {
        recordGate(
          '3. Firebase Project & DB Alignment',
          'FAIL',
          `firebase-applet-config.json firestoreDatabaseId is "${appletConfig?.firestoreDatabaseId}", expected "${EXPECTED_DATABASE_ID}"`,
          Date.now() - start
        );
        return false;
      }
      recordGate(
        '3. Firebase Project & DB Alignment',
        'PASS',
        `Project ${EXPECTED_PROJECT_ID} & DB ${EXPECTED_DATABASE_ID} aligned across .firebaserc, firebase.json, and firebase-applet-config.json`,
        Date.now() - start
      );
      return true;
    }

    if (allowMissingAppletConfig) {
      recordGate(
        '3. Firebase Project & DB Alignment',
        'WARN',
        `Aligned in .firebaserc & firebase.json; local firebase-applet-config.json absent (allowed via --allow-missing-applet-config — bootstrap before running vite build)`,
        Date.now() - start
      );
      return true;
    }

    recordGate(
      '3. Firebase Project & DB Alignment',
      'FAIL',
      'Missing local firebase-applet-config.json (required at Vite build time by src/lib/firebase.ts). See RELEASE_MERGE_GUIDE.md Section 3 to bootstrap it without committing to Git, or pass --allow-missing-applet-config.',
      Date.now() - start
    );
    return false;
  } catch (err) {
    recordGate(
      '3. Firebase Project & DB Alignment',
      'FAIL',
      err instanceof Error ? err.message : String(err),
      Date.now() - start
    );
    return false;
  }
}

function runNpmGate(gateName, npmScript, skipReason = null) {
  const start = Date.now();
  if (skipReason) {
    recordGate(gateName, 'SKIP', skipReason, Date.now() - start);
    return true;
  }

  console.log(`\n--- Running ${gateName}: npm run ${npmScript} ---`);
  const res = runProcess(npmCmd, ['run', npmScript], { capture: false });
  if (res.status !== 0) {
    recordGate(gateName, 'FAIL', `npm run ${npmScript} exited with code ${res.status}`, Date.now() - start);
    return false;
  }

  recordGate(gateName, 'PASS', `npm run ${npmScript} succeeded`, Date.now() - start);
  return true;
}

function main() {
  console.log('===================================================================');
  console.log('  Autoelectric Lab Pro — Pre-Merge Release Preflight Check');
  console.log(`  Mode: ${isQuick ? 'QUICK (--quick)' : 'FULL RELEASE VERIFICATION'}`);
  console.log(`  Target Firebase Project: ${EXPECTED_PROJECT_ID}`);
  console.log(`  Target Firestore DB:     ${EXPECTED_DATABASE_ID}`);
  console.log('===================================================================\n');

  const outcomes = [
    gate1SecretAndIgnoreHygiene(),
    gate2GitTrackingAndBranchGuard(),
    gate3FirebaseAlignment(),
    runNpmGate('4. Firestore Rules & Blueprint Verification', 'rules:verify'),
    runNpmGate('5. TypeScript Type Check', 'lint'),
    runNpmGate(
      '6. Production Vite Build',
      'build',
      skipBuild ? 'Skipped via CLI flag' : null
    ),
    runNpmGate(
      '7. Full 22-Suite Simulation & Security Tests',
      'test',
      skipTests ? 'Skipped via CLI flag' : null
    ),
  ];

  console.log('\n===================================================================');
  console.log('  RELEASE PREFLIGHT SUMMARY');
  console.log('===================================================================');
  for (const r of results) {
    console.log(`  ${r.status.padEnd(4)} | ${r.name.padEnd(44)} | ${(r.durationMs / 1000).toFixed(2)}s`);
  }

  const allPassed = outcomes.every(Boolean);
  console.log('-------------------------------------------------------------------');
  if (allPassed) {
    console.log('  RESULT: READY TO MERGE & PUBLISH');
    console.log('===================================================================\n');
    process.exit(0);
  } else {
    console.error('  RESULT: BLOCKED — Fix all [FAIL] gates before merging to main.');
    console.log('===================================================================\n');
    process.exit(1);
  }
}

main();
