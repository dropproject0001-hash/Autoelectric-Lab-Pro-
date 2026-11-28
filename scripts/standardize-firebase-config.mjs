/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const args = process.argv.slice(2);

const TARGET_PROJECT_ID = 'gen-lang-client-0822907731';
const TARGET_DATABASE_ID = 'ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82';
const TARGET_APP_ID = '1:7481410566:web:7924ac419ec8615bb16f87';
const TARGET_MESSAGING_SENDER_ID = '7481410566';

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function hasFlag(flag) {
  return args.includes(flag);
}

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  const prefix = `${flag}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function readJsonIfExists(relPath) {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function writePrettyJson(relPath, data) {
  const fullPath = path.join(rootDir, relPath);
  fs.writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function fetchSdkConfigFromFirebaseCli(projectId, appId) {
  const cliArgs = ['--yes', 'firebase-tools', 'apps:sdkconfig', 'WEB'];
  if (appId) cliArgs.push(appId);
  cliArgs.push('--project', projectId, '--json');

  const res = spawnSync(npxCmd, cliArgs, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (res.status !== 0) {
    return {
      ok: false,
      error: (res.stderr || res.stdout || `firebase apps:sdkconfig exited with ${res.status}`).trim(),
    };
  }

  try {
    const parsed = JSON.parse(res.stdout);
    const sdkCfg = parsed?.result?.sdkConfig || parsed?.sdkConfig || parsed;
    if (sdkCfg && sdkCfg.apiKey && sdkCfg.projectId) {
      return { ok: true, config: sdkCfg };
    }
    return { ok: false, error: 'Firebase CLI returned JSON without sdkConfig.apiKey/projectId.' };
  } catch (err) {
    return {
      ok: false,
      error: `Unable to parse Firebase CLI JSON output: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function resolveStandardizedConfig() {
  const existing = readJsonIfExists('firebase-applet-config.json') || {};
  const fromCli = hasFlag('--from-cli');
  const fromEnvJson = process.env.FIREBASE_APPLET_CONFIG_JSON;

  let base = { ...existing };

  if (fromEnvJson) {
    const parsedEnv = JSON.parse(fromEnvJson);
    base = { ...base, ...parsedEnv };
  }

  if (fromCli) {
    console.log(`Fetching Web SDK config from Firebase CLI for project ${TARGET_PROJECT_ID}...`);
    const cliResult = fetchSdkConfigFromFirebaseCli(TARGET_PROJECT_ID, getArgValue('--app-id') || TARGET_APP_ID);
    if (!cliResult.ok) {
      throw new Error(`--from-cli failed: ${cliResult.error}`);
    }
    base = { ...base, ...cliResult.config };
  }

  const projectId = TARGET_PROJECT_ID;
  const firestoreDatabaseId = TARGET_DATABASE_ID;
  const apiKey =
    getArgValue('--api-key') ||
    process.env.VITE_FIREBASE_API_KEY ||
    process.env.FIREBASE_WEB_API_KEY ||
    base.apiKey ||
    '';

  const appId =
    getArgValue('--app-id') ||
    process.env.VITE_FIREBASE_APP_ID ||
    base.appId ||
    TARGET_APP_ID;

  const authDomain =
    process.env.VITE_FIREBASE_AUTH_DOMAIN ||
    base.authDomain ||
    `${projectId}.firebaseapp.com`;

  const storageBucket =
    process.env.VITE_FIREBASE_STORAGE_BUCKET ||
    base.storageBucket ||
    `${projectId}.firebasestorage.app`;

  const messagingSenderId =
    process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    base.messagingSenderId ||
    TARGET_MESSAGING_SENDER_ID;

  return {
    projectId,
    appId,
    apiKey,
    authDomain,
    firestoreDatabaseId,
    storageBucket,
    messagingSenderId,
    measurementId: base.measurementId || '',
    oAuthClientId: base.oAuthClientId || '',
    recaptchaSiteKey: base.recaptchaSiteKey || '',
  };
}

function ensureProjectLinks() {
  const firebaserc = readJsonIfExists('.firebaserc') || { projects: {} };
  if (!firebaserc.projects || typeof firebaserc.projects !== 'object') {
    firebaserc.projects = {};
  }
  const rcChanged = firebaserc.projects.default !== TARGET_PROJECT_ID;
  firebaserc.projects.default = TARGET_PROJECT_ID;
  if (rcChanged || !fs.existsSync(path.join(rootDir, '.firebaserc'))) {
    writePrettyJson('.firebaserc', firebaserc);
    console.log(`Updated .firebaserc -> default project "${TARGET_PROJECT_ID}"`);
  }

  const firebaseJson = readJsonIfExists('firebase.json');
  if (firebaseJson) {
    let fjChanged = false;
    firebaseJson.firestore = firebaseJson.firestore || {};
    if (firebaseJson.firestore.database !== TARGET_DATABASE_ID) {
      firebaseJson.firestore.database = TARGET_DATABASE_ID;
      fjChanged = true;
    }
    if (firebaseJson.firestore.rules !== 'firestore.rules') {
      firebaseJson.firestore.rules = 'firestore.rules';
      fjChanged = true;
    }
    if (firebaseJson.firestore.indexes !== 'firestore.indexes.json') {
      firebaseJson.firestore.indexes = 'firestore.indexes.json';
      fjChanged = true;
    }
    if (fjChanged) {
      writePrettyJson('firebase.json', firebaseJson);
      console.log(`Updated firebase.json -> database "${TARGET_DATABASE_ID}"`);
    }
  }
}

function main() {
  const checkOnly = hasFlag('--check');
  const standardized = resolveStandardizedConfig();

  const missingApiKey =
    !standardized.apiKey ||
    standardized.apiKey.includes('YOUR_FIREBASE_API_KEY') ||
    standardized.apiKey.trim().length < 10;

  if (missingApiKey) {
    console.error(
      'ERROR: Missing valid Firebase Web API key. Provide one of:\n' +
        '  1) Re-run with --from-cli (after "npx firebase-tools login")\n' +
        '  2) Set VITE_FIREBASE_API_KEY or FIREBASE_WEB_API_KEY in your shell environment\n' +
        '  3) Pass --api-key "<KEY_FROM_FIREBASE_CONSOLE>"\n' +
        '  4) Set FIREBASE_APPLET_CONFIG_JSON in CI/Cloud Build'
    );
    process.exit(1);
  }

  if (checkOnly) {
    const current = readJsonIfExists('firebase-applet-config.json');
    if (!current) {
      console.error('ERROR: firebase-applet-config.json does not exist.');
      process.exit(1);
    }
    const problems = [];
    if (current.projectId !== TARGET_PROJECT_ID) {
      problems.push(`projectId="${current.projectId}" (expected "${TARGET_PROJECT_ID}")`);
    }
    if (current.firestoreDatabaseId !== TARGET_DATABASE_ID) {
      problems.push(`firestoreDatabaseId="${current.firestoreDatabaseId}" (expected "${TARGET_DATABASE_ID}")`);
    }
    if (!current.apiKey || current.apiKey.includes('YOUR_FIREBASE_API_KEY')) {
      problems.push('apiKey is missing or still a placeholder');
    }
    if (!current.appId || !current.authDomain) {
      problems.push('appId or authDomain is missing');
    }
    if (problems.length > 0) {
      console.error(`ERROR: firebase-applet-config.json failed standardization check:\n  - ${problems.join('\n  - ')}`);
      process.exit(1);
    }
    console.log(
      `OK: firebase-applet-config.json is standardized for project "${TARGET_PROJECT_ID}" and DB "${TARGET_DATABASE_ID}".`
    );
    return;
  }

  writePrettyJson('firebase-applet-config.json', standardized);
  ensureProjectLinks();

  // Verify Git ignores firebase-applet-config.json if inside a Git repo
  const gitCheck = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (gitCheck.status === 0 && String(gitCheck.stdout || '').trim() === 'true') {
    const ignoreCheck = spawnSync('git', ['check-ignore', '-q', 'firebase-applet-config.json'], {
      cwd: rootDir,
      stdio: 'pipe',
    });
    if (ignoreCheck.status !== 0) {
      console.warn('WARNING: firebase-applet-config.json is NOT currently ignored by .gitignore!');
    }
  }

  console.log(
    `Standardized firebase-applet-config.json for project "${TARGET_PROJECT_ID}" (DB: "${TARGET_DATABASE_ID}").`
  );
}

main();
