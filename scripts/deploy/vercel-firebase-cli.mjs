#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

/**
 * AutoElectric Lab Pro — Unified Vercel & Firebase Deployment + Automated Login Fix CLI
 *
 * Usage:
 *   node scripts/deploy/vercel-firebase-cli.mjs help
 *   node scripts/deploy/vercel-firebase-cli.mjs fix [--url https://autoelectriclab-pro.vercel.app] [--skip-deploy]
 *   node scripts/deploy/vercel-firebase-cli.mjs doctor
 *   node scripts/deploy/vercel-firebase-cli.mjs secrets
 *   node scripts/deploy/vercel-firebase-cli.mjs probe --url https://autoelectriclab-pro.vercel.app
 *   node scripts/deploy/vercel-firebase-cli.mjs vercel:env [--env-file .env.production.local] [--target production]
 *   node scripts/deploy/vercel-firebase-cli.mjs vercel:deploy [--preview]
 *   node scripts/deploy/vercel-firebase-cli.mjs firebase:rules
 *   node scripts/deploy/vercel-firebase-cli.mjs firebase:domains [--domain autoelectriclab-pro.vercel.app] [--apply]
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const args = process.argv.slice(2);
const command = (args[0] || 'help').trim();

const DEFAULT_LIVE_URL = 'https://autoelectriclab-pro.vercel.app';

const SYNC_ENV_KEYS = [
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

function writeEnvFile(filePath, entries) {
  const lines = [
    '# AutoElectric Lab Pro — Auto-generated local production env (gitignored, NEVER commit)',
    `# Updated: ${new Date().toISOString()}`,
    '',
  ];
  for (const [k, v] of Object.entries(entries)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      lines.push(`${k}=${String(v).trim()}`);
    }
  }
  lines.push('');
  fs.writeFileSync(filePath, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
}

function runCmd(cmd, cmdArgs, options = {}) {
  return spawnSync(cmd, cmdArgs, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    input: options.input,
  });
}

function generateStrongSecrets() {
  const hmacSecret = crypto.randomBytes(32).toString('hex');
  let adminPin = '';
  for (let i = 0; i < 12; i++) {
    adminPin += String(crypto.randomInt(0, 10));
  }
  return { adminPin, hmacSecret };
}

function extractHostname(urlOrHost) {
  const raw = String(urlOrHost || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return parsed.hostname;
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0];
  }
}

function loadMergedConfig() {
  const fromDotEnv = parseEnvFile(path.join(rootDir, '.env'));
  const fromProdEnv = parseEnvFile(path.join(rootDir, '.env.production'));
  const fromProdLocal = parseEnvFile(path.join(rootDir, '.env.production.local'));
  const appletCfg = readJsonSafe('firebase-applet-config.json') || {};
  const firebaserc = readJsonSafe('.firebaserc') || {};
  const firebaseJson = readJsonSafe('firebase.json') || {};

  const merged = {
    ...fromDotEnv,
    ...fromProdEnv,
    ...fromProdLocal,
  };

  // Overlay shell env if non-empty
  for (const key of SYNC_ENV_KEYS) {
    if (process.env[key] && String(process.env[key]).trim()) {
      merged[key] = String(process.env[key]).trim();
    }
  }

  // Backfill Firebase client config from firebase-applet-config.json ONLY if it matches .firebaserc project
  const rcDefaultProject = String(firebaserc?.projects?.default || '').trim();
  const appletMatchesProject =
    !rcDefaultProject || !appletCfg.projectId || String(appletCfg.projectId).trim() === rcDefaultProject;

  if (appletMatchesProject) {
    if (!merged.VITE_FIREBASE_API_KEY && appletCfg.apiKey) {
      merged.VITE_FIREBASE_API_KEY = String(appletCfg.apiKey).trim();
    }
    if (!merged.VITE_FIREBASE_PROJECT_ID && appletCfg.projectId) {
      merged.VITE_FIREBASE_PROJECT_ID = String(appletCfg.projectId).trim();
    }
    if (!merged.VITE_FIREBASE_AUTH_DOMAIN && appletCfg.authDomain) {
      merged.VITE_FIREBASE_AUTH_DOMAIN = String(appletCfg.authDomain).trim();
    }
    if (!merged.VITE_FIREBASE_APP_ID && appletCfg.appId) {
      merged.VITE_FIREBASE_APP_ID = String(appletCfg.appId).trim();
    }
    if (!merged.VITE_FIREBASE_DATABASE_ID && appletCfg.firestoreDatabaseId) {
      merged.VITE_FIREBASE_DATABASE_ID = String(appletCfg.firestoreDatabaseId).trim();
    }
    if (!merged.VITE_FIREBASE_STORAGE_BUCKET && appletCfg.storageBucket) {
      merged.VITE_FIREBASE_STORAGE_BUCKET = String(appletCfg.storageBucket).trim();
    }
    if (!merged.VITE_FIREBASE_MESSAGING_SENDER_ID && appletCfg.messagingSenderId) {
      merged.VITE_FIREBASE_MESSAGING_SENDER_ID = String(appletCfg.messagingSenderId).trim();
    }
  }

  // Fallback projectId & databaseId from .firebaserc / firebase.json
  const defaultProject =
    merged.VITE_FIREBASE_PROJECT_ID ||
    merged.FIREBASE_PROJECT_ID ||
    firebaserc?.projects?.default ||
    '';
  if (defaultProject && !merged.FIREBASE_PROJECT_ID) {
    merged.FIREBASE_PROJECT_ID = defaultProject;
  }
  if (defaultProject && !merged.VITE_FIREBASE_PROJECT_ID) {
    merged.VITE_FIREBASE_PROJECT_ID = defaultProject;
  }
  if (defaultProject && !merged.VITE_FIREBASE_AUTH_DOMAIN) {
    merged.VITE_FIREBASE_AUTH_DOMAIN = `${defaultProject}.firebaseapp.com`;
  }
  if (!merged.VITE_FIREBASE_DATABASE_ID && firebaseJson?.firestore?.database) {
    merged.VITE_FIREBASE_DATABASE_ID = String(firebaseJson.firestore.database).trim();
  }

  return merged;
}

function tryFetchFirebaseWebSdkConfig(projectId) {
  if (!projectId) return null;
  const res = runCmd(
    'npx',
    ['--yes', 'firebase-tools', 'apps:sdkconfig', 'WEB', '--project', projectId, '--json'],
    { capture: true }
  );
  if (res.status !== 0 || !res.stdout) return null;
  try {
    const parsed = JSON.parse(res.stdout);
    const sdk = parsed?.result?.sdkConfig || parsed?.sdkConfig || null;
    return sdk && sdk.apiKey ? sdk : null;
  } catch {
    return null;
  }
}

function getGoogleAccessToken() {
  if (process.env.FIREBASE_ACCESS_TOKEN && process.env.FIREBASE_ACCESS_TOKEN.trim()) {
    return process.env.FIREBASE_ACCESS_TOKEN.trim();
  }
  const gcloud = runCmd('gcloud', ['auth', 'print-access-token'], { capture: true });
  if (gcloud.status === 0 && String(gcloud.stdout || '').trim()) {
    return String(gcloud.stdout).trim();
  }
  return '';
}

async function authorizeFirebaseDomainViaApi(projectId, domain) {
  const token = getGoogleAccessToken();
  if (!token) {
    return {
      ok: false,
      reason: 'NO_ACCESS_TOKEN',
      message:
        'No gcloud/FIREBASE_ACCESS_TOKEN found in shell. Add the domain manually in Firebase Console (link below) or run `gcloud auth login` and re-run.',
    };
  }

  const endpoint = `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(
    projectId
  )}/config`;

  try {
    const getRes = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (!getRes.ok) {
      const errText = await getRes.text().catch(() => '');
      return {
        ok: false,
        reason: `HTTP_${getRes.status}`,
        message: `Failed reading Identity Toolkit config (HTTP ${getRes.status}): ${errText.slice(0, 200)}`,
      };
    }
    const cfg = await getRes.json();
    const existing = Array.isArray(cfg.authorizedDomains) ? cfg.authorizedDomains : [];
    if (existing.includes(domain)) {
      return { ok: true, alreadyPresent: true, domains: existing };
    }

    const updated = [...existing, domain];
    const patchRes = await fetch(`${endpoint}?updateMask=authorizedDomains`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ authorizedDomains: updated }),
    });
    if (!patchRes.ok) {
      const errText = await patchRes.text().catch(() => '');
      return {
        ok: false,
        reason: `HTTP_${patchRes.status}`,
        message: `Failed updating authorizedDomains (HTTP ${patchRes.status}): ${errText.slice(0, 200)}`,
      };
    }
    return { ok: true, alreadyPresent: false, domains: updated };
  } catch (err) {
    return {
      ok: false,
      reason: 'NETWORK_ERROR',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function pushEnvVarsToVercel(envMap, targets = ['production', 'preview']) {
  const toPush = SYNC_ENV_KEYS.filter((k) => Boolean(envMap[k] && String(envMap[k]).trim()));
  if (toPush.length === 0) {
    return { ok: false, pushed: 0, error: 'No non-empty environment variables to push.' };
  }

  let pushed = 0;
  for (const target of targets) {
    console.log(`\n  Syncing ${toPush.length} env var(s) -> Vercel [${target}]...`);
    for (const key of toPush) {
      runCmd('npx', ['--yes', 'vercel', 'env', 'rm', key, target, '--yes'], { capture: true });
      const addRes = runCmd('npx', ['--yes', 'vercel', 'env', 'add', key, target], {
        capture: true,
        input: `${String(envMap[key]).trim()}\n`,
      });
      if (addRes.status === 0) {
        console.log(`    [PASS] ${key} -> ${target}`);
        pushed += 1;
      } else {
        const msg = String(addRes.stderr || addRes.stdout || '').trim();
        console.error(`    [FAIL] ${key} -> ${target}: ${msg}`);
        return { ok: false, pushed, error: msg };
      }
    }
  }
  return { ok: true, pushed };
}

function printHelp() {
  console.log(`
AutoElectric Lab Pro — Vercel & Firebase Automated CLI
======================================================

Commands:
  fix [--url https://...]         1-COMMAND AUTO-FIX: build api/index.mjs, generate/load PIN & Firebase
      [--skip-deploy]             secrets, sync all env vars to Vercel, authorize Firebase domain,
      [--skip-rules]              deploy Firestore rules, redeploy Vercel production, and probe login!
  doctor                          Check Vercel/Firebase config files, bundled api/index.mjs, CLIs & env
  secrets                         Generate strong VECL_LICENSE_HMAC_SECRET (64 hex) & VECL_ADMIN_MASTER_PIN (12 digits)
  probe --url <https://...>       Diagnose live Account PIN API + Gmail/Firebase client config
  vercel:env [--env-file <path>]  Sync required login & Firebase env vars from an env file to Vercel
             [--target production|preview|development]
  vercel:deploy [--preview]       Build and deploy to Vercel (--prod by default)
  firebase:rules                  Verify firestore.rules and deploy Firestore rules + indexes via Firebase CLI
  firebase:domains [--domain ...] [--apply]
                                  Authorize domain in Firebase Auth (with --apply) or print Console link

Examples:
  npm run deploy:fix -- --url https://autoelectriclab-pro.vercel.app
  npm run deploy:doctor
  npm run deploy:cli -- probe --url https://autoelectriclab-pro.vercel.app
  npm run deploy:cli -- secrets
  npm run deploy:cli -- vercel:env --env-file .env.production.local --target production
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
  checkFile('src/server/vercelHandler.ts', 'Vercel serverless Express API source');
  checkFile('api/index.mjs', 'Pre-bundled Vercel ESM API entrypoint (run npm run build:api)');
  checkFile('.firebaserc', 'Firebase project config');
  checkFile('firebase.json', 'Firebase hosting/firestore config');
  checkFile('firestore.rules', 'Firestore security rules');

  const firebaserc = readJsonSafe('.firebaserc');
  const firebaseJson = readJsonSafe('firebase.json');
  const projectId = firebaserc?.projects?.default || '(unset)';
  const dbId = firebaseJson?.firestore?.database || '(default)';
  console.log(`\n  Active Firebase Project : ${projectId}`);
  console.log(`  Active Firestore DB     : ${dbId}`);

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

  const envMerged = loadMergedConfig();
  const requiredLoginEnv = [
    { key: 'VECL_ADMIN_MASTER_PIN', minLen: 10 },
    { key: 'VECL_LICENSE_HMAC_SECRET', minLen: 32 },
    { key: 'VITE_FIREBASE_API_KEY', minLen: 10 },
    { key: 'VITE_FIREBASE_PROJECT_ID', minLen: 4 },
    { key: 'VITE_FIREBASE_AUTH_DOMAIN', minLen: 6 },
    { key: 'VITE_FIREBASE_APP_ID', minLen: 8 },
    { key: 'FIREBASE_PROJECT_ID', minLen: 4 },
  ];

  console.log('\n  Environment Variable Readiness (local shell / .env* / firebase-applet-config.json):');
  for (const item of requiredLoginEnv) {
    const val = String(envMerged[item.key] || '').trim();
    const ok = val.length >= item.minLen;
    console.log(
      `  [${ok ? 'PASS' : 'WARN'}] ${item.key.padEnd(26)} ${
        ok ? `configured (${val.length} chars)` : `missing or < ${item.minLen} chars (run npm run deploy:fix)`
      }`
    );
  }

  console.log(
    `\nResult: ${issues === 0 ? 'REPO READY FOR VERCEL & FIREBASE DEPLOYMENT' : `${issues} blocking repo file(s) missing`}\n`
  );
  process.exit(issues === 0 ? 0 : 1);
}

function cmdSecrets() {
  const { adminPin, hmacSecret } = generateStrongSecrets();
  console.log('=== Generated Strong Production Secrets (NEVER commit to Git) ===\n');
  console.log(`VECL_ADMIN_MASTER_PIN=${adminPin}`);
  console.log(`VECL_LICENSE_HMAC_SECRET=${hmacSecret}`);
  console.log('\nRun `npm run deploy:fix -- --url https://autoelectriclab-pro.vercel.app` to push automatically to Vercel.');
}

async function runProbe(rawUrl) {
  const cleanUrl = String(rawUrl || '').trim().replace(/\/+$/, '');
  const hostname = extractHostname(cleanUrl);
  console.log(`=== Probing Live Deployment: ${cleanUrl} ===\n`);
  let failed = false;

  try {
    // 1. Account PIN Backend Health
    const healthRes = await fetch(`${cleanUrl}/api/health`, {
      headers: { Accept: 'application/json' },
    });
    const vercelErr = healthRes.headers.get('x-vercel-error');
    const healthText = await healthRes.text();
    let healthJson = null;
    try {
      healthJson = JSON.parse(healthText);
    } catch {
      healthJson = null;
    }

    if (healthRes.ok && healthJson?.status === 'ONLINE') {
      console.log(`  [PASS] Account PIN API  : GET /api/health -> HTTP ${healthRes.status} (ONLINE)`);
    } else {
      failed = true;
      console.error(
        `  [FAIL] Account PIN API  : GET /api/health -> HTTP ${healthRes.status}${
          vercelErr ? ` (${vercelErr})` : ''
        }`
      );
      if (vercelErr === 'FUNCTION_INVOCATION_FAILED') {
        console.error(
          '         Cause: Vercel serverless function crashed on boot. Ensure bundled api/index.mjs is pushed and redeployed.'
        );
      }
    }

    // 2. Account PIN Admin Master Config
    const cfgRes = await fetch(`${cleanUrl}/api/autoelectric/trial/admin/config`, {
      headers: { Accept: 'application/json' },
    });
    const cfgJson = await cfgRes.json().catch(() => null);
    if (!cfgRes.ok || !cfgJson) {
      failed = true;
      console.error(`  [FAIL] Master PIN Config: GET /api/autoelectric/trial/admin/config -> HTTP ${cfgRes.status}`);
    } else {
      console.log(`  [PASS] Master PIN Config: GET /api/autoelectric/trial/admin/config -> HTTP ${cfgRes.status}`);
      console.log(`         masterEnvConfigured : ${cfgJson.masterEnvConfigured}`);
      console.log(`         strictMode          : ${cfgJson.strictMode}`);
      console.log(`         envPinPolicyError   : ${cfgJson.envPinPolicyError ?? 'none'}`);
      if (!cfgJson.masterEnvConfigured) {
        failed = true;
        console.error('  [ACTION] Missing VECL_ADMIN_MASTER_PIN in Vercel -> run `npm run deploy:fix`');
      }
      if (cfgJson.envPinPolicyError) {
        failed = true;
        console.error(`  [ACTION] Fix server env policy error: ${cfgJson.envPinPolicyError}`);
      }
    }

    // 3. Frontend SPA & Gmail/Firebase Build-Time Config Check
    const homeRes = await fetch(`${cleanUrl}/`, { headers: { Accept: 'text/html' } });
    const homeHtml = await homeRes.text();
    if (!homeRes.ok) {
      failed = true;
      console.error(`  [FAIL] Frontend SPA     : GET / -> HTTP ${homeRes.status}`);
    } else {
      console.log(`  [PASS] Frontend SPA     : GET / -> HTTP ${homeRes.status} (${homeHtml.length} bytes)`);
      // Inspect firebase chunk (modulepreload) and main entry script for Firebase web apiKey / authDomain
      const assetUrls = new Set([
        ...[...homeHtml.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]),
        ...[...homeHtml.matchAll(/href="([^"]*firebase[^"]*\.js)"/g)].map((m) => m[1]),
      ]);
      let foundFirebaseKey = false;
      let foundFirebaseAuthDomain = '';
      for (const relScript of [...assetUrls].slice(0, 6)) {
        const scriptUrl = relScript.startsWith('http')
          ? relScript
          : `${cleanUrl}${relScript.startsWith('/') ? '' : '/'}${relScript}`;
        const jsText = await fetch(scriptUrl).then((r) => (r.ok ? r.text() : '')).catch(() => '');
        if (/AIza[0-9A-Za-z_-]{30,}/.test(jsText)) {
          foundFirebaseKey = true;
        }
        const domMatch = jsText.match(/([a-z0-9-]+\.firebaseapp\.com)/);
        if (domMatch) {
          foundFirebaseAuthDomain = domMatch[1];
        }
      }
      if (foundFirebaseKey) {
        console.log(
          `  [PASS] Gmail / Firebase : Web API key detected in live bundle${
            foundFirebaseAuthDomain ? ` (authDomain: ${foundFirebaseAuthDomain})` : ''
          }`
        );
        console.log(
          `         Verify "${hostname}" is listed in Firebase Console -> Authentication -> Settings -> Authorized domains.`
        );
      } else {
        failed = true;
        console.error(
          '  [FAIL] Gmail / Firebase : No VITE_FIREBASE_API_KEY detected in live bundle!'
        );
        console.error(
          '         Cause: firebase-applet-config.json is gitignored, so Vercel needs VITE_FIREBASE_* env vars + a fresh redeploy.'
        );
        console.error('  [ACTION] Run `npm run deploy:fix -- --url ' + cleanUrl + '` to push all VITE_FIREBASE_* vars & redeploy.');
      }
    }
  } catch (err) {
    failed = true;
    console.error(`  [FAIL] Network error probing ${cleanUrl}: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(
    `\nProbe Result: ${failed ? 'LOGIN BLOCKERS DETECTED (see [FAIL]/[ACTION] above)' : 'ALL ACCOUNT PIN & FIREBASE CHECKS PASSED'}\n`
  );
  return !failed;
}

async function cmdProbe() {
  const rawUrl = getArgFlag('--url', DEFAULT_LIVE_URL).trim().replace(/\/+$/, '');
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    console.error('Error: Provide --url https://your-deployment.vercel.app');
    process.exit(1);
  }
  const ok = await runProbe(rawUrl);
  process.exit(ok ? 0 : 1);
}

function cmdVercelEnv() {
  const envFile = path.resolve(rootDir, getArgFlag('--env-file', '.env.production.local'));
  const target = getArgFlag('--target', 'production');
  if (!fs.existsSync(envFile)) {
    console.error(`Error: Env file not found at ${envFile}`);
    console.error('Pass --env-file <path> or run `npm run deploy:fix` to generate & sync automatically.');
    process.exit(1);
  }

  const parsed = parseEnvFile(envFile);
  const res = pushEnvVarsToVercel(parsed, [target]);
  if (!res.ok) {
    process.exit(1);
  }
  console.log('\nAll environment variables synced! Run `npm run vercel:deploy` to redeploy with the new values.');
}

function cmdVercelDeploy() {
  const isPreview = hasFlag('--preview');
  console.log(`=== Building & Deploying AutoElectric Lab Pro to Vercel (${isPreview ? 'PREVIEW' : 'PRODUCTION'}) ===\n`);
  const buildRes = runCmd('npm', ['run', 'build']);
  if (buildRes.status !== 0) {
    console.error('Build failed; deployment aborted.');
    process.exit(buildRes.status ?? 1);
  }
  const vercelArgs = ['--yes', 'vercel', ...(isPreview ? [] : ['--prod']), '--yes'];
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

async function cmdFirebaseDomains() {
  const merged = loadMergedConfig();
  const projectId =
    merged.VITE_FIREBASE_PROJECT_ID ||
    merged.FIREBASE_PROJECT_ID ||
    readJsonSafe('.firebaserc')?.projects?.default ||
    '<your-firebase-project-id>';
  const domain = extractHostname(getArgFlag('--domain', DEFAULT_LIVE_URL)) || 'autoelectriclab-pro.vercel.app';
  const apply = hasFlag('--apply');

  console.log('=== Firebase Google Sign-In Authorized Domains ===\n');
  console.log(`  Firebase Project : ${projectId}`);
  console.log(`  Domain           : ${domain}`);
  console.log(
    `  Console URL      : https://console.firebase.google.com/project/${projectId}/authentication/settings`
  );

  if (apply) {
    console.log('\n  Attempting automated authorization via Identity Toolkit Admin API...');
    const res = await authorizeFirebaseDomainViaApi(projectId, domain);
    if (res.ok) {
      console.log(
        `  [PASS] Domain "${domain}" is ${res.alreadyPresent ? 'already authorized' : 'now authorized'} in Firebase project "${projectId}"!`
      );
      return;
    }
    console.warn(`  [WARN] Automated API call skipped/failed (${res.reason}): ${res.message}`);
  }

  console.log('\nManual 10-second fallback:');
  console.log('  1. Open the Firebase Console URL above.');
  console.log('  2. Click "Authorized domains" -> "Add domain".');
  console.log(`  3. Enter "${domain}" and click Save.`);
  console.log('  4. Ensure Google Sign-In provider is enabled under Authentication -> Sign-in method.');
}

async function cmdFix() {
  const liveUrl = getArgFlag('--url', DEFAULT_LIVE_URL).trim().replace(/\/+$/, '');
  const hostname = extractHostname(liveUrl);
  const skipDeploy = hasFlag('--skip-deploy');
  const skipRules = hasFlag('--skip-rules');

  console.log('====================================================================');
  console.log(' AutoElectric Lab Pro — Automated Account PIN & Gmail Login Fixer');
  console.log('====================================================================\n');
  console.log(`  Target Live URL : ${liveUrl}`);
  console.log(`  Target Hostname : ${hostname}\n`);

  // Step 1: Build frontend + bundled Vercel ESM API (api/index.mjs)
  console.log('[Step 1/7] Building frontend & bundled Vercel ESM API (api/index.mjs)...');
  const buildRes = runCmd('npm', ['run', 'build']);
  if (buildRes.status !== 0) {
    console.error('[FAIL] Build failed. Fix build errors above and re-run.');
    process.exit(1);
  }
  console.log('  [PASS] dist/ and api/index.mjs built cleanly.\n');

  // Step 2: Gather & auto-generate all required Account PIN + Firebase env vars
  console.log('[Step 2/7] Resolving Account PIN secrets & Firebase Web config...');
  const merged = loadMergedConfig();
  let generatedNewPin = false;

  if (!merged.VECL_ADMIN_MASTER_PIN || merged.VECL_ADMIN_MASTER_PIN.length < 10) {
    const { adminPin } = generateStrongSecrets();
    merged.VECL_ADMIN_MASTER_PIN = adminPin;
    generatedNewPin = true;
    console.log('  [AUTO] Generated new 12-digit VECL_ADMIN_MASTER_PIN.');
  } else {
    console.log(`  [PASS] Using existing VECL_ADMIN_MASTER_PIN (${merged.VECL_ADMIN_MASTER_PIN.length} chars).`);
  }

  if (!merged.VECL_LICENSE_HMAC_SECRET || merged.VECL_LICENSE_HMAC_SECRET.length < 32) {
    const { hmacSecret } = generateStrongSecrets();
    merged.VECL_LICENSE_HMAC_SECRET = hmacSecret;
    console.log('  [AUTO] Generated new 64-char VECL_LICENSE_HMAC_SECRET.');
  } else {
    console.log(`  [PASS] Using existing VECL_LICENSE_HMAC_SECRET (${merged.VECL_LICENSE_HMAC_SECRET.length} chars).`);
  }

  // If Firebase client config is still missing, try fetching from Firebase CLI
  if (!merged.VITE_FIREBASE_API_KEY && merged.FIREBASE_PROJECT_ID) {
    console.log(`  [AUTO] Fetching Web SDK config via Firebase CLI for project ${merged.FIREBASE_PROJECT_ID}...`);
    const sdk = tryFetchFirebaseWebSdkConfig(merged.FIREBASE_PROJECT_ID);
    if (sdk) {
      merged.VITE_FIREBASE_API_KEY = sdk.apiKey || '';
      merged.VITE_FIREBASE_AUTH_DOMAIN = sdk.authDomain || `${merged.FIREBASE_PROJECT_ID}.firebaseapp.com`;
      merged.VITE_FIREBASE_PROJECT_ID = sdk.projectId || merged.FIREBASE_PROJECT_ID;
      merged.VITE_FIREBASE_APP_ID = sdk.appId || '';
      merged.VITE_FIREBASE_STORAGE_BUCKET = sdk.storageBucket || '';
      merged.VITE_FIREBASE_MESSAGING_SENDER_ID = sdk.messagingSenderId || '';
      console.log('  [PASS] Pulled Firebase Web SDK config automatically.');
    }
  }

  const firebaseClientProjectId =
    merged.VITE_FIREBASE_PROJECT_ID || merged.FIREBASE_PROJECT_ID || '(unset)';
  if (merged.VITE_FIREBASE_API_KEY) {
    console.log(
      `  [PASS] Firebase Web config ready (projectId=${firebaseClientProjectId}, authDomain=${merged.VITE_FIREBASE_AUTH_DOMAIN}).`
    );
  } else {
    console.warn(
      '  [WARN] VITE_FIREBASE_API_KEY not found locally. Gmail login requires VITE_FIREBASE_* vars in .env.production.local or firebase-applet-config.json.'
    );
  }

  // Save merged production env locally (gitignored) so the user always has their generated Master PIN
  const localEnvPath = path.join(rootDir, '.env.production.local');
  writeEnvFile(localEnvPath, merged);
  console.log(`  [PASS] Saved local backup to .env.production.local (gitignored).\n`);

  // Step 3: Verify Vercel CLI authentication & project link
  console.log('[Step 3/7] Checking Vercel CLI authentication & project link...');
  let whoami = runCmd('npx', ['--yes', 'vercel', 'whoami'], { capture: true });
  if (whoami.status !== 0) {
    console.log('  [INFO] Not logged into Vercel CLI yet — launching interactive `vercel login`...');
    const loginRes = runCmd('npx', ['--yes', 'vercel', 'login']);
    if (loginRes.status !== 0) {
      console.error('[FAIL] Vercel login failed or was cancelled.');
      process.exit(1);
    }
    whoami = runCmd('npx', ['--yes', 'vercel', 'whoami'], { capture: true });
  }
  console.log(`  [PASS] Vercel account: ${String(whoami.stdout || '').trim()}`);

  if (!fs.existsSync(path.join(rootDir, '.vercel', 'project.json'))) {
    console.log('  [AUTO] Linking workspace to Vercel project...');
    const linkRes = runCmd('npx', ['--yes', 'vercel', 'link', '--yes']);
    if (linkRes.status !== 0) {
      console.error('[FAIL] Could not link Vercel project. Run `npx vercel link` manually.');
      process.exit(1);
    }
  }
  console.log('  [PASS] Vercel project linked.\n');

  // Step 4: Sync all Account PIN & Firebase env vars to Vercel (production & preview)
  console.log('[Step 4/7] Pushing all Account PIN & Firebase env vars to Vercel...');
  const syncRes = pushEnvVarsToVercel(merged, ['production', 'preview']);
  if (!syncRes.ok) {
    console.error(`[FAIL] Failed syncing env vars to Vercel: ${syncRes.error}`);
    process.exit(1);
  }
  console.log(`  [PASS] Synced ${syncRes.pushed} env var entries to Vercel.\n`);

  // Step 5: Authorize Vercel domain in Firebase Auth (fixes Gmail auth/unauthorized-domain)
  console.log(`[Step 5/7] Authorizing "${hostname}" in Firebase Authentication for Gmail Sign-In...`);
  const domainRes = await authorizeFirebaseDomainViaApi(firebaseClientProjectId, hostname);
  if (domainRes.ok) {
    console.log(
      `  [PASS] "${hostname}" is ${domainRes.alreadyPresent ? 'already authorized' : 'now authorized'} in Firebase project "${firebaseClientProjectId}".\n`
    );
  } else {
    console.warn(`  [WARN] Could not auto-add domain via API (${domainRes.reason}): ${domainRes.message}`);
    console.log(
      `  [ACTION] Open: https://console.firebase.google.com/project/${firebaseClientProjectId}/authentication/settings`
    );
    console.log(`           -> Authorized domains -> Add domain -> "${hostname}"\n`);
  }

  // Step 6: Deploy Firestore Rules (best-effort if Firebase CLI is logged in)
  if (!skipRules) {
    console.log('[Step 6/7] Verifying Firestore security rules...');
    const verifyRes = runCmd('npm', ['run', 'rules:verify'], { capture: true });
    if (verifyRes.status === 0) {
      console.log('  [PASS] firestore.rules verified locally.');
      const fbProject = readJsonSafe('.firebaserc')?.projects?.default;
      if (fbProject) {
        const rulesDeploy = runCmd(
          'npx',
          ['--yes', 'firebase-tools', 'deploy', '--project', fbProject, '--only', 'firestore:rules,firestore:indexes'],
          { capture: true }
        );
        if (rulesDeploy.status === 0) {
          console.log(`  [PASS] Deployed Firestore rules to ${fbProject}.\n`);
        } else {
          console.log(
            '  [INFO] Skipped live Firestore rules deploy (run `npx firebase-tools login` then `npm run firebase:deploy:rules` if needed).\n'
          );
        }
      }
    } else {
      console.warn('  [WARN] Local firestore.rules verification reported an issue.\n');
    }
  } else {
    console.log('[Step 6/7] Skipped Firestore rules (--skip-rules).\n');
  }

  // Step 7: Redeploy Vercel production & probe live endpoints
  if (!skipDeploy) {
    console.log('[Step 7/7] Redeploying AutoElectric Lab Pro to Vercel Production...');
    const depRes = runCmd('npx', ['--yes', 'vercel', '--prod', '--yes']);
    if (depRes.status !== 0) {
      console.error('[FAIL] Vercel production deployment failed.');
      process.exit(1);
    }
    console.log('\n  [PASS] Vercel production deployment complete! Probing live login endpoints...\n');
    await runProbe(liveUrl);
  } else {
    console.log('[Step 7/7] Skipped Vercel deploy (--skip-deploy).\n');
  }

  console.log('====================================================================');
  console.log(' LOGIN CREDENTIALS SUMMARY (also saved in .env.production.local)');
  console.log('====================================================================');
  console.log(`  Live App URL          : ${liveUrl}`);
  console.log(`  Admin Master PIN      : ${merged.VECL_ADMIN_MASTER_PIN}${generatedNewPin ? ' (NEWLY GENERATED)' : ''}`);
  console.log(`  Firebase Auth Project : ${firebaseClientProjectId}`);
  console.log(
    `  Firebase Auth Console : https://console.firebase.google.com/project/${firebaseClientProjectId}/authentication/settings`
  );
  console.log('====================================================================\n');
}

async function main() {
  switch (command) {
    case 'fix':
      await cmdFix();
      break;
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
      await cmdFirebaseDomains();
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
