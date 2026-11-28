#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

/**
 * AutoElectric Lab Pro — Unified Vercel & Firebase Deployment + Login Diagnostics CLI
 *
 * Usage:
 *   node scripts/deploy/vercel-firebase-cli.mjs help
 *   node scripts/deploy/vercel-firebase-cli.mjs doctor
 *   node scripts/deploy/vercel-firebase-cli.mjs secrets
 *   node scripts/deploy/vercel-firebase-cli.mjs probe --url https://your-app.vercel.app
 *   node scripts/deploy/vercel-firebase-cli.mjs vercel:env [--env-file .env.production] [--target production]
 *   node scripts/deploy/vercel-firebase-cli.mjs vercel:deploy [--preview]
 *   node scripts/deploy/vercel-firebase-cli.mjs firebase:rules
 *   node scripts/deploy/vercel-firebase-cli.mjs firebase:domains [--domain your-app.vercel.app]
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const args = process.argv.slice(2);
const command = (args[0] || 'help').trim();

function getArgFlag(name, fallback = '') {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  const prefix = `${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function readJsonSafe(relPath) {
  try {
    const full = path.join(rootDir, relPath);
    if (!fs.existsSync(full)) return null;
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    return null;
  }
}

function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

function runCmd(cmd, cmdArgs, options = {}) {
  return spawnSync(cmd, cmdArgs, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    input: options.input,
  });
}

function printHelp() {
  console.log(`
AutoElectric Lab Pro — Vercel & Firebase CLI
============================================

Commands:
  doctor                          Check Vercel/Firebase config files, CLIs, and required login secrets
  secrets                         Generate strong VECL_LICENSE_HMAC_SECRET (64 hex) & VECL_ADMIN_MASTER_PIN (12 digits)
  probe --url <https://...>       Diagnose live Vercel deployment login endpoints (/api/health & /admin/config)
  vercel:env [--env-file .env]    Sync required login & Firebase env vars from an env file to Vercel
             [--target production|preview|development]
  vercel:deploy [--preview]       Run preflight check and deploy to Vercel (--prod by default)
  firebase:rules                  Verify firestore.rules and deploy Firestore rules + indexes via Firebase CLI
  firebase:domains [--domain ...] Print exact Firebase Console Authorized Domains link & setup checklist

Examples:
  npm run deploy:doctor
  npm run deploy:cli -- secrets
  npm run deploy:cli -- probe --url https://autoelectric-lab-pro.vercel.app
  npm run deploy:cli -- vercel:env --env-file .env.production --target production
  npm run vercel:deploy
  npm run deploy:cli -- firebase:rules
`);
}

function cmdDoctor() {
  console.log('=== AutoElectric Lab Pro — Vercel & Firebase Doctor ===\n');
  let issues = 0;

  const checkFile = (rel, label) => {
    const ok = fs.existsSync(path.join(rootDir, rel));
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label} (${rel})`);
    if (!ok) issues += 1;
    return ok;
  };

  checkFile('vercel.json', 'Vercel routing config');
  checkFile('api/index.ts', 'Vercel serverless Express API entrypoint');
  checkFile('.firebaserc', 'Firebase project config');
  checkFile('firebase.json', 'Firebase hosting/firestore config');
  checkFile('firestore.rules', 'Firestore security rules');

  const firebaserc = readJsonSafe('.firebaserc');
  const firebaseJson = readJsonSafe('firebase.json');
  const projectId = firebaserc?.projects?.default || '(unset)';
  const dbId = firebaseJson?.firestore?.database || '(default)';
  console.log(`\n  Active Firebase Project : ${projectId}`);
  console.log(`  Active Firestore DB     : ${dbId}`);

  // Check local CLI availability
  const vercelCheck = runCmd('npx', ['--no-install', 'vercel', '--version'], { capture: true });
  const firebaseCheck = runCmd('npx', ['--no-install', 'firebase', '--version'], { capture: true });
  console.log(
    `  [${vercelCheck.status === 0 ? 'PASS' : 'INFO'}] Vercel CLI   : ${
      vercelCheck.status === 0
        ? String(vercelCheck.stdout || '').trim()
        : 'Not installed locally (will run via npx --yes vercel)'
    }`
  );
  console.log(
    `  [${firebaseCheck.status === 0 ? 'PASS' : 'INFO'}] Firebase CLI : ${
      firebaseCheck.status === 0
        ? String(firebaseCheck.stdout || '').trim()
        : 'Not installed locally (will run via npx --yes firebase-tools)'
    }`
  );

  // Check local env vars / .env if present
  const envMerged = {
    ...parseEnvFile(path.join(rootDir, '.env')),
    ...process.env,
  };
  const requiredLoginEnv = [
    { key: 'VECL_ADMIN_MASTER_PIN', minLen: 10 },
    { key: 'VECL_LICENSE_HMAC_SECRET', minLen: 32 },
    { key: 'VITE_FIREBASE_API_KEY', minLen: 10 },
    { key: 'VITE_FIREBASE_PROJECT_ID', minLen: 4 },
    { key: 'VITE_FIREBASE_AUTH_DOMAIN', minLen: 6 },
    { key: 'VITE_FIREBASE_APP_ID', minLen: 8 },
    { key: 'FIREBASE_PROJECT_ID', minLen: 4 },
  ];

  console.log('\n  Environment Variable Readiness (local shell / .env):');
  for (const item of requiredLoginEnv) {
    const val = String(envMerged[item.key] || '').trim();
    const ok = val.length >= item.minLen;
    console.log(
      `  [${ok ? 'PASS' : 'WARN'}] ${item.key.padEnd(26)} ${
        ok ? `configured (${val.length} chars)` : `missing or < ${item.minLen} chars (must be set in Vercel Dashboard)`
      }`
    );
  }

  console.log(
    `\nResult: ${issues === 0 ? 'REPO READY FOR VERCEL & FIREBASE DEPLOYMENT' : `${issues} blocking repo file(s) missing`}\n`
  );
  process.exit(issues === 0 ? 0 : 1);
}

function cmdSecrets() {
  const hmacSecret = crypto.randomBytes(32).toString('hex');
  // 12-digit numeric PIN using crypto.randomInt
  let adminPin = '';
  for (let i = 0; i < 12; i++) {
    adminPin += String(crypto.randomInt(0, 10));
  }
  console.log('=== Generated Strong Production Secrets (NEVER commit to Git) ===\n');
  console.log(`VECL_ADMIN_MASTER_PIN=${adminPin}`);
  console.log(`VECL_LICENSE_HMAC_SECRET=${hmacSecret}`);
  console.log('\nAdd both to Vercel -> Project Settings -> Environment Variables (Production & Preview), then Redeploy.');
}

async function cmdProbe() {
  const rawUrl = getArgFlag('--url', '').trim().replace(/\/+$/, '');
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    console.error('Error: Provide --url https://your-deployment.vercel.app');
    process.exit(1);
  }

  console.log(`=== Probing Live Deployment: ${rawUrl} ===\n`);
  let failed = false;

  try {
    const healthRes = await fetch(`${rawUrl}/api/health`, {
      headers: { Accept: 'application/json' },
    });
    const healthText = await healthRes.text();
    let healthJson = null;
    try {
      healthJson = JSON.parse(healthText);
    } catch {
      healthJson = null;
    }

    if (healthRes.ok && healthJson?.status === 'ONLINE') {
      console.log(`  [PASS] GET /api/health -> HTTP ${healthRes.status} (ONLINE)`);
    } else {
      failed = true;
      console.error(
        `  [FAIL] GET /api/health -> HTTP ${healthRes.status}. Backend API is not reachable on Vercel (ensure vercel.json & api/index.ts are deployed).`
      );
    }

    const cfgRes = await fetch(`${rawUrl}/api/autoelectric/trial/admin/config`, {
      headers: { Accept: 'application/json' },
    });
    const cfgJson = await cfgRes.json().catch(() => null);
    if (!cfgRes.ok || !cfgJson) {
      failed = true;
      console.error(`  [FAIL] GET /api/autoelectric/trial/admin/config -> HTTP ${cfgRes.status}`);
    } else {
      console.log(`  [PASS] GET /api/autoelectric/trial/admin/config -> HTTP ${cfgRes.status}`);
      console.log(`         masterEnvConfigured : ${cfgJson.masterEnvConfigured}`);
      console.log(`         strictMode          : ${cfgJson.strictMode}`);
      console.log(`         envPinPolicyError   : ${cfgJson.envPinPolicyError ?? 'none'}`);
      if (!cfgJson.masterEnvConfigured) {
        failed = true;
        console.error('  [ACTION] Set VECL_ADMIN_MASTER_PIN (>=10 chars) in Vercel Environment Variables.');
      }
      if (cfgJson.envPinPolicyError) {
        failed = true;
        console.error(`  [ACTION] Fix server env policy error: ${cfgJson.envPinPolicyError}`);
      }
    }
  } catch (err) {
    failed = true;
    console.error(`  [FAIL] Network error probing ${rawUrl}: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(
    `\nProbe Result: ${failed ? 'LOGIN BLOCKERS DETECTED (see [FAIL]/[ACTION] above)' : 'BACKEND LOGIN ENDPOINTS HEALTHY'}\n`
  );
  process.exit(failed ? 1 : 0);
}

function cmdVercelEnv() {
  const envFile = path.resolve(rootDir, getArgFlag('--env-file', '.env.production'));
  const target = getArgFlag('--target', 'production');
  if (!fs.existsSync(envFile)) {
    console.error(`Error: Env file not found at ${envFile}`);
    console.error('Pass --env-file <path> pointing to your local production env file.');
    process.exit(1);
  }

  const parsed = parseEnvFile(envFile);
  const allowedKeys = [
    'VECL_ADMIN_MASTER_PIN',
    'VECL_LICENSE_HMAC_SECRET',
    'GEMINI_API_KEY',
    'FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_DATABASE_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'IMAGE_ANALYSIS_PROVIDER',
  ];

  const toPush = allowedKeys.filter((k) => Boolean(parsed[k] && parsed[k].trim()));
  if (toPush.length === 0) {
    console.error('No recognized non-empty environment variables found in', envFile);
    process.exit(1);
  }

  console.log(`Syncing ${toPush.length} environment variable(s) to Vercel target "${target}"...`);
  for (const key of toPush) {
    // Remove old value silently if present, then add cleanly via stdin (secret never exposed in argv)
    runCmd('npx', ['--yes', 'vercel', 'env', 'rm', key, target, '--yes'], { capture: true });
    const addRes = runCmd('npx', ['--yes', 'vercel', 'env', 'add', key, target], {
      capture: true,
      input: `${parsed[key]}\n`,
    });
    if (addRes.status === 0) {
      console.log(`  [PASS] Synced ${key} -> ${target}`);
    } else {
      console.error(`  [FAIL] Failed syncing ${key}: ${String(addRes.stderr || addRes.stdout || '').trim()}`);
      process.exit(1);
    }
  }
  console.log('\nAll environment variables synced! Run `npm run vercel:deploy` to redeploy with the new values.');
}

function cmdVercelDeploy() {
  const isPreview = hasFlag('--preview');
  console.log(`=== Deploying AutoElectric Lab Pro to Vercel (${isPreview ? 'PREVIEW' : 'PRODUCTION'}) ===\n`);
  const vercelArgs = ['--yes', 'vercel', ...(isPreview ? [] : ['--prod'])];
  const res = runCmd('npx', vercelArgs);
  process.exit(res.status ?? 1);
}

function cmdFirebaseRules() {
  const firebaserc = readJsonSafe('.firebaserc');
  const firebaseJson = readJsonSafe('firebase.json');
  const projectId = firebaserc?.projects?.default;
  const dbId = firebaseJson?.firestore?.database;

  if (!projectId) {
    console.error('Error: Missing default project in .firebaserc');
    process.exit(1);
  }

  console.log(`=== Verifying & Deploying Firestore Rules to ${projectId} (DB: ${dbId || '(default)'}) ===\n`);
  const verify = runCmd('npm', ['run', 'rules:verify']);
  if (verify.status !== 0) {
    console.error('Firestore rules verification failed; deployment aborted.');
    process.exit(verify.status ?? 1);
  }

  const deployArgs = [
    '--yes',
    'firebase-tools',
    'deploy',
    '--project',
    projectId,
    '--only',
    'firestore:rules,firestore:indexes',
  ];
  const res = runCmd('npx', deployArgs);
  process.exit(res.status ?? 1);
}

function cmdFirebaseDomains() {
  const firebaserc = readJsonSafe('.firebaserc');
  const projectId = firebaserc?.projects?.default || '<your-firebase-project-id>';
  const domain = getArgFlag('--domain', '<your-project>.vercel.app');
  console.log('=== Firebase Google Sign-In Authorized Domains Setup ===\n');
  console.log(`  Firebase Project : ${projectId}`);
  console.log(`  Domain to Add    : ${domain}`);
  console.log(
    `  Console URL      : https://console.firebase.google.com/project/${projectId}/authentication/settings`
  );
  console.log('\nSteps:');
  console.log('  1. Open the Firebase Console URL above.');
  console.log('  2. Click "Authorized domains" -> "Add domain".');
  console.log(`  3. Enter "${domain}" and click Save.`);
  console.log('  4. Ensure Google Sign-In provider is enabled under Authentication -> Sign-in method.');
}

async function main() {
  switch (command) {
    case 'doctor':
      cmdDoctor();
      break;
    case 'secrets':
      cmdSecrets();
      break;
    case 'probe':
      await cmdProbe();
      break;
    case 'vercel:env':
      cmdVercelEnv();
      break;
    case 'vercel:deploy':
      cmdVercelDeploy();
      break;
    case 'firebase:rules':
      cmdFirebaseRules();
      break;
    case 'firebase:domains':
      cmdFirebaseDomains();
      break;
    case 'help':
    case '--help':
    case '-h':
    default:
      printHelp();
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
