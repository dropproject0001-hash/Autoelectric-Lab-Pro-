# Autoelectric Lab Pro — Production Migration & Deployment Guide

This guide provides end-to-end instructions and ready-to-run shell scripts (**Linux/macOS Bash**, **Windows PowerShell**, and **Windows Command Prompt / CMD**) to migrate the current development workspace into a production-ready Git repository, standardize `firebase-applet-config.json`, link the project to the production Firebase instance **`gen-lang-client-0822907731`**, and deploy the full-stack application safely.

---

## 1. Production Architecture & Fixed Identifiers

`autoelectric-lab-pro` is a full-stack TypeScript application:
- **Backend (`server.ts`)**: Express API (`/api/*`) + Gemini Live Voice WebSocket server (`src/server/services/geminiLiveVoiceServer.ts`) + production static SPA server (`dist/` when `NODE_ENV=production`). Binds automatically to `0.0.0.0:${PORT}` (Cloud Run injects `PORT=8080`).
- **Frontend (`src/`)**: React 19 + Vite 8 + Tailwind CSS 4 + Three.js + D3 oscilloscope/diagnostics + PWA service worker (`/sw.js`, `/manifest.webmanifest`).
- **Database & Auth**: Firebase Authentication (Google Sign-In) + Cloud Firestore named database protected by owner-scoped `firestore.rules`.

| Identifier | Production Value |
|---|---|
| **Package Name** | `autoelectric-lab-pro` |
| **Firebase Project Name** | `Autoelectrical Lab Pro` |
| **Firebase Project ID** | `gen-lang-client-0822907731` |
| **Firebase Project Number / Sender ID** | `7481410566` |
| **Firebase Web App ID** | `1:7481410566:web:7924ac419ec8615bb16f87` |
| **Firestore Named Database ID** | `ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82` |
| **Default Cloud Run Region** | `asia-southeast1` |
| **Primary Git Publish Branch** | `main` |

### Companion Automation Scripts Included in This Repository
- `scripts/standardize-firebase-config.mjs` — Validates/writes a standardized `firebase-applet-config.json` and aligns `.firebaserc` + `firebase.json` (`npm run firebase:standardize` / `npm run firebase:standardize:check`).
- `scripts/deploy/setup-production-env.sh` — Automated Linux/macOS Bash environment bootstrap & Firebase linker.
- `scripts/deploy/setup-production-env.ps1` — Automated Windows PowerShell environment bootstrap & Firebase linker.
- `scripts/deploy/setup-production-env.cmd` — Automated Windows Command Prompt (CMD) environment bootstrap & Firebase linker.
- `scripts/preflight-release-check.mjs` — 7-gate pre-merge release readiness check (`npm run release:check`).
- `scripts/verify-firestore-rules.mjs` — Firestore security rules & blueprint verifier (`npm run rules:verify`).

---

## 2. Prerequisites & CLI Tool Authentication

Install **Node.js 20+** (Node 22 LTS recommended), **Git 2.38+**, **Google Cloud CLI (`gcloud`)**, and use **Firebase CLI** via `npx --yes firebase-tools`.

### Linux / macOS (Bash)
```bash
node -v && npm -v && git --version && gcloud --version
npx --yes firebase-tools --version

npx --yes firebase-tools login
gcloud auth login
gcloud config set project gen-lang-client-0822907731
```

### Windows PowerShell
```powershell
node -v; npm -v; git --version; gcloud --version
npx --yes firebase-tools --version

npx --yes firebase-tools login
gcloud auth login
gcloud config set project gen-lang-client-0822907731
```

### Windows Command Prompt (CMD)
```cmd
node -v && npm -v && git --version && gcloud --version
npx --yes firebase-tools --version

npx --yes firebase-tools login
gcloud auth login
gcloud config set project gen-lang-client-0822907731
```

---

## 3. Step 1 — Migrate the Workspace into a Production Git Repository

Choose **Path A** if you are merging into an existing GitHub repository with a `main` branch, or **Path B** if you are initializing a brand-new production repository.

### Path A — Overlay into an Existing Production Repository (Recommended)

Never overwrite `.git`, local `.env` files, or `.github/workflows/`. Create a release branch off `origin/main` and overlay only tracked source files.

#### Linux / macOS (Bash)
```bash
export PROD_REPO="$HOME/Projects/autoelectric-lab-pro"
export EXPORT_DIR="$HOME/Downloads/autoelectric-lab-pro-export"
export MIGRATION_BRANCH="release/prod-migration"

cd "$PROD_REPO"
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b "$MIGRATION_BRANCH"

rsync -av \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='build/' \
  --exclude='.data/' \
  --exclude='.aistudio/' \
  --exclude='public/assets/aistudio/' \
  --exclude='.vscode/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --include='.env.example' \
  --exclude='firebase-applet-config.json' \
  --exclude='*.log' \
  --exclude='*.tmp' \
  --exclude='*.bak' \
  --exclude='*.zip' \
  --exclude='*.pdf' \
  "$EXPORT_DIR/" "$PROD_REPO/"
```

#### Windows PowerShell
```powershell
$PROD_REPO        = "C:\Projects\autoelectric-lab-pro"
$EXPORT_DIR       = "C:\Downloads\autoelectric-lab-pro-export"
$MIGRATION_BRANCH = "release/prod-migration"

Set-Location $PROD_REPO
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b $MIGRATION_BRANCH

robocopy $EXPORT_DIR $PROD_REPO /E `
  /XD ".git" "node_modules" "dist" "build" ".data" ".aistudio" "public\assets\aistudio" ".vscode" `
  /XF ".env" ".env.local" ".env.production" ".env.development" "firebase-applet-config.json" "*.log" "*.tmp" "*.bak" "*.zip" "*.pdf"
if ($LASTEXITCODE -ge 8) { throw "Robocopy failed with exit code $LASTEXITCODE" }
Write-Host "Workspace overlay complete." -ForegroundColor Green
```

#### Windows Command Prompt (CMD)
```cmd
set "PROD_REPO=C:\Projects\autoelectric-lab-pro"
set "EXPORT_DIR=C:\Downloads\autoelectric-lab-pro-export"
set "MIGRATION_BRANCH=release/prod-migration"

cd /d "%PROD_REPO%"
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b %MIGRATION_BRANCH%

robocopy "%EXPORT_DIR%" "%PROD_REPO%" /E ^
  /XD ".git" "node_modules" "dist" "build" ".data" ".aistudio" "public\assets\aistudio" ".vscode" ^
  /XF ".env" ".env.local" ".env.production" ".env.development" "firebase-applet-config.json" "*.log" "*.tmp" "*.bak" "*.zip" "*.pdf"
if errorlevel 8 (echo ROBOCOPY FAILED & exit /b 1) else (echo Workspace overlay complete.)
```

### Path B — Initialize a Brand-New Production Repository
```bash
cd /path/to/exported-workspace
git init -b main
git remote add origin https://github.com/<YOUR_ORG_OR_USER>/autoelectric-lab-pro.git

# Verify ignored secrets are NOT listed as untracked files
git status --ignored -s
```

---

## 4. Step 2 — Configure Production Environments (Bash / PowerShell / CMD)

### Environment Variables Matrix
Copy `.env.example` to `.env` for local development, and store real secrets in **Google Secret Manager** (never commit `.env*` to Git).

| Variable | Required? | Exposure | Description |
|---|---|---|---|
| `NODE_ENV` | Prod: Yes | Server only | Must be `production` in Cloud Run / App Hosting so `server.ts` serves `dist/` |
| `PORT` | Auto-injected | Server only | Cloud Run injects `8080`; local dev defaults to `3000` |
| `APP_URL` | Prod: Yes | Server only | Live HTTPS origin (e.g., `https://autoelectric-lab-pro-xxxx-as.a.run.app`) |
| `GEMINI_API_KEY` | Yes | Server secret | Primary Gemini API key — **never** prefix with `VITE_` |
| `GEMINI_API_KEY_2` / `_3` | Optional | Server secret | Secondary Gemini keys for automatic `QuotaManager` failover rotation |
| `GEMINI_MODEL` | Optional | Server only | Defaults to `gemini-4-hydrogen` |
| `GEMINI_SEARCH_MODEL` | Optional | Server only | Defaults to `gemini-4-hydrogen` |
| `GEMINI_QUOTA_SWITCH_RATIO` | Optional | Server only | Proactive key rotation threshold (`0.8`) |
| `GEMINI_KEY_RPM_LIMIT` | Optional | Server only | Soft per-key requests/min (`15`) |
| `IMAGE_ANALYSIS_PROVIDER` | Optional | Server only | `gemini` \| `openai` \| `manual` |
| `OPENAI_API_KEY` | Optional | Server secret | Only needed if `IMAGE_ANALYSIS_PROVIDER="openai"` |
| `VECL_ADMIN_MASTER_PIN` | Prod: Yes | Server secret | Server-side Master Admin PIN for the 3–6 hour Trial PIN Generator |
| `VECL_ADMIN_UIDS` | Prod: Yes | Server only | Comma-separated verified Firebase Admin UIDs (replaces legacy email bootstrap) |
| `VECL_DATA_DIR` | Prod: Yes | Server only | Mount path to persistent volume (e.g., `/var/lib/autoelectric`) so `.store.json`, revocation registry, and signing keys survive redeploys |
| `VECL_LICENSE_HMAC_SECRET` | Prod: Yes | Server secret | 32+ character HMAC signing secret (`VECL_STRICT_PRODUCTION_SECRETS=true`) |
| `AELP_LICENSE_SIGNING_PRIVATE_KEY_JWK` | Prod: Yes | Server secret | ECDSA P-256 JWK private key for offline signed activation keys |
| `VECL_STRICT_PRODUCTION_SECRETS` | Prod: Yes | Server only | Set `true` in production to fail closed on missing secrets and block unauthenticated first-run PIN setup |
| `VITE_FIREBASE_*` | Optional | Client build | Fallback overrides only; standard builds use `firebase-applet-config.json` |

### Run the Automated Environment Setup Scripts

Each script checks Node/npm/Git, bootstraps `.env` from `.env.example` without overwriting existing values, installs dependencies, links the repo to `gen-lang-client-0822907731`, standardizes `firebase-applet-config.json`, and executes `npm run release:check:quick`.

#### Linux / macOS (Bash)
```bash
chmod +x scripts/deploy/setup-production-env.sh

# Fetch live Web SDK config from Firebase CLI & standardize firebase-applet-config.json:
./scripts/deploy/setup-production-env.sh --from-cli

# Or also deploy Firestore rules & indexes in one pass:
./scripts/deploy/setup-production-env.sh --from-cli --deploy-rules
```

#### Windows PowerShell
```powershell
# Fetch live Web SDK config from Firebase CLI & standardize firebase-applet-config.json:
powershell -ExecutionPolicy Bypass -File scripts\deploy\setup-production-env.ps1 -FromCli

# Or also deploy Firestore rules & indexes in one pass:
powershell -ExecutionPolicy Bypass -File scripts\deploy\setup-production-env.ps1 -FromCli -DeployRules
```

#### Windows Command Prompt (CMD)
```cmd
REM Fetch live Web SDK config from Firebase CLI & standardize firebase-applet-config.json:
scripts\deploy\setup-production-env.cmd --from-cli

REM Or also deploy Firestore rules & indexes in one pass:
scripts\deploy\setup-production-env.cmd --from-cli --deploy-rules
```

---

## 5. Step 3 — Standardizing `firebase-applet-config.json`

### Why Standardization Matters
1. `src/lib/firebase.ts` directly imports `../../firebase-applet-config.json` at Vite build time so the production client bundle always connects to **`gen-lang-client-0822907731`** and named database **`ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82`** (preventing silent fallback to `(default)` or stale `VITE_*` variables).
2. `.gitignore` intentionally ignores `firebase-applet-config.json` so environment-specific client configs are never accidentally committed across branches.

### Canonical `firebase-applet-config.json` Schema
```json
{
  "projectId": "gen-lang-client-0822907731",
  "appId": "1:7481410566:web:7924ac419ec8615bb16f87",
  "apiKey": "<FETCHED_FROM_FIREBASE_CONSOLE_OR_CLI>",
  "authDomain": "gen-lang-client-0822907731.firebaseapp.com",
  "firestoreDatabaseId": "ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82",
  "storageBucket": "gen-lang-client-0822907731.firebasestorage.app",
  "messagingSenderId": "7481410566",
  "measurementId": "",
  "oAuthClientId": "",
  "recaptchaSiteKey": ""
}
```

### Standardize Automatically via CLI or Environment Variable

#### Option 1 — Pull Directly from Firebase CLI (All Shells)
```bash
npm run firebase:standardize -- --from-cli
npm run firebase:standardize:check
```

#### Option 2 — Generate from `FIREBASE_WEB_API_KEY` (Offline / CI)

**Bash:**
```bash
export FIREBASE_WEB_API_KEY="PASTE_WEB_API_KEY_FROM_FIREBASE_CONSOLE"
npm run firebase:standardize
npm run firebase:standardize:check
```

**PowerShell:**
```powershell
$env:FIREBASE_WEB_API_KEY = "PASTE_WEB_API_KEY_FROM_FIREBASE_CONSOLE"
npm run firebase:standardize
npm run firebase:standardize:check
```

**CMD:**
```cmd
set "FIREBASE_WEB_API_KEY=PASTE_WEB_API_KEY_FROM_FIREBASE_CONSOLE"
npm run firebase:standardize
npm run firebase:standardize:check
```

#### Option 3 — CI / Cloud Build Bootstrap from JSON Secret (`FIREBASE_APPLET_CONFIG_JSON`)
Store the standardized JSON in Google Secret Manager as `FIREBASE_APPLET_CONFIG_JSON` and run `npm run firebase:standardize` during CI before `npm run build`. The script automatically reads `process.env.FIREBASE_APPLET_CONFIG_JSON`, enforces `projectId` and `firestoreDatabaseId`, and writes `firebase-applet-config.json` for Vite.

#### Verify Git Still Ignores `firebase-applet-config.json`
```bash
git check-ignore -v firebase-applet-config.json
# Expected output: .gitignore:30:firebase-applet-config.json	firebase-applet-config.json
```

---

## 6. Step 4 — Link to Production Firebase Instance (`gen-lang-client-0822907731`)

### 6.1 Verify `.firebaserc` and `firebase.json`
Ensure `.firebaserc` maps `default` to `gen-lang-client-0822907731`:
```json
{
  "projects": {
    "default": "gen-lang-client-0822907731"
  }
}
```
Ensure `firebase.json` targets the named database `ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82`:
```json
{
  "firestore": {
    "database": "ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82",
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

### 6.2 Link CLI, Validate Rules, and Deploy Rules + Indexes

#### Linux / macOS (Bash)
```bash
npx --yes firebase-tools use gen-lang-client-0822907731
npm run rules:verify
npx --yes firebase-tools deploy \
  --only firestore:rules,firestore:indexes \
  --database ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82 \
  --project gen-lang-client-0822907731
```

#### Windows PowerShell
```powershell
npx --yes firebase-tools use gen-lang-client-0822907731
npm run rules:verify
npx --yes firebase-tools deploy `
  --only firestore:rules,firestore:indexes `
  --database ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82 `
  --project gen-lang-client-0822907731
```

#### Windows Command Prompt (CMD)
```cmd
npx --yes firebase-tools use gen-lang-client-0822907731
npm run rules:verify
npx --yes firebase-tools deploy ^
  --only firestore:rules,firestore:indexes ^
  --database ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82 ^
  --project gen-lang-client-0822907731
```

### 6.3 Authorize Your Production Hostname for Google Sign-In
1. Open [Firebase Console](https://console.firebase.google.com/project/gen-lang-client-0822907731/authentication/settings).
2. Navigate to **Authentication → Settings → Authorized domains**.
3. Click **Add domain** and add your published Cloud Run URL, Firebase App Hosting hostname, and any custom domain (without `https://`).

---

## 7. Step 5 — Pre-Merge Quality Gate & GitHub `main` Merge

Run the full 7-gate preflight script before committing or opening a pull request:
```bash
npm run release:check
```
This validates:
1. `.gitignore` rules & zero hardcoded secrets in `src/`, `scripts/`, and `server.ts`
2. Zero tracked/staged secrets in Git
3. `.firebaserc`, `firebase.json`, and `firebase-applet-config.json` alignment (`gen-lang-client-0822907731` + `ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82`)
4. `npm run rules:verify` (`@firebase/eslint-plugin-security-rules` + blueprint match check)
5. `npm run lint` (`tsc --noEmit`)
6. `npm run build` (`vite build`)
7. `npm test` (all 17 simulation, offline sync, calibration, and security suites)

### Commit, Push & Merge to `main`
```bash
git add -A
git diff --cached --name-only   # Confirm .env and firebase-applet-config.json are NOT listed
git commit -m "chore(release): migrate workspace to production repository & link gen-lang-client-0822907731"
git push -u origin release/prod-migration
```
Open a PR into `main` (or merge with `git checkout main && git merge --no-ff release/prod-migration && git tag -a v1.4.0 -m "Production release v1.4.0" && git push origin main --follow-tags`).

---

## 8. Step 6 — Deploy to Production Hosting

### Option A — Google Cloud Run (Recommended for Express + WebSockets + SPA)

#### 1. Enable APIs & Create Production Secrets (One-Time)

**Bash:**
```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com \
  --project=gen-lang-client-0822907731

printf "%s" "YOUR_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=- --project=gen-lang-client-0822907731
printf "%s" "YOUR_ADMIN_MASTER_PIN" | gcloud secrets create VECL_ADMIN_MASTER_PIN --data-file=- --project=gen-lang-client-0822907731
```

**PowerShell:**
```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com `
  --project=gen-lang-client-0822907731

"YOUR_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=- --project=gen-lang-client-0822907731
"YOUR_ADMIN_MASTER_PIN" | gcloud secrets create VECL_ADMIN_MASTER_PIN --data-file=- --project=gen-lang-client-0822907731
```

**CMD:**
```cmd
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com ^
  --project=gen-lang-client-0822907731

echo|set /p="YOUR_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=- --project=gen-lang-client-0822907731
echo|set /p="YOUR_ADMIN_MASTER_PIN" | gcloud secrets create VECL_ADMIN_MASTER_PIN --data-file=- --project=gen-lang-client-0822907731
```
*(To rotate an existing secret later, use `gcloud secrets versions add <NAME> --data-file=-`.)*

#### 2. Add `Dockerfile` and `.dockerignore` in Your Production Repo Root

`Dockerfile`:
```dockerfile
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Requires standardized firebase-applet-config.json in the build context
RUN npm run firebase:standardize:check && npm run build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
```

`.dockerignore`:
```text
node_modules
dist
.git
.env
.env.*
!.env.example
.data
.aistudio
public/assets/aistudio
*.log
*.pdf
*.zip
```

#### 3. Build & Deploy to Cloud Run (`asia-southeast1`)

**Bash:**
```bash
gcloud run deploy autoelectric-lab-pro \
  --source . \
  --project gen-lang-client-0822907731 \
  --region asia-southeast1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 300 \
  --set-env-vars "NODE_ENV=production,GEMINI_MODEL=gemini-4-hydrogen" \
  --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest,VECL_ADMIN_MASTER_PIN=VECL_ADMIN_MASTER_PIN:latest"
```

**PowerShell:**
```powershell
gcloud run deploy autoelectric-lab-pro `
  --source . `
  --project gen-lang-client-0822907731 `
  --region asia-southeast1 `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --timeout 300 `
  --set-env-vars "NODE_ENV=production,GEMINI_MODEL=gemini-4-hydrogen" `
  --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest,VECL_ADMIN_MASTER_PIN=VECL_ADMIN_MASTER_PIN:latest"
```

**CMD:**
```cmd
gcloud run deploy autoelectric-lab-pro ^
  --source . ^
  --project gen-lang-client-0822907731 ^
  --region asia-southeast1 ^
  --platform managed ^
  --allow-unauthenticated ^
  --port 8080 ^
  --timeout 300 ^
  --set-env-vars "NODE_ENV=production,GEMINI_MODEL=gemini-4-hydrogen" ^
  --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest,VECL_ADMIN_MASTER_PIN=VECL_ADMIN_MASTER_PIN:latest"
```

Bind `APP_URL` to the deployed Cloud Run URL:
```bash
gcloud run services update autoelectric-lab-pro \
  --project gen-lang-client-0822907731 \
  --region asia-southeast1 \
  --update-env-vars "APP_URL=https://YOUR-CLOUD-RUN-SERVICE-URL"
```

---

### Option B — Firebase App Hosting (Continuous Deploy on GitHub `main`)

1. Add `apphosting.yaml` to the repository root:
```yaml
runConfig:
  cpu: 1
  memoryMiB: 1024
  concurrency: 80
  minInstances: 0
  maxInstances: 4

env:
  - variable: NODE_ENV
    value: production
    availability: [RUNTIME]
  - variable: GEMINI_MODEL
    value: gemini-4-hydrogen
    availability: [RUNTIME]
  - variable: GEMINI_API_KEY
    secret: GEMINI_API_KEY
    availability: [RUNTIME]
  - variable: VECL_ADMIN_MASTER_PIN
    secret: VECL_ADMIN_MASTER_PIN
    availability: [RUNTIME]
  - variable: FIREBASE_APPLET_CONFIG_JSON
    secret: FIREBASE_APPLET_CONFIG_JSON
    availability: [BUILD]
```
2. Add `"prebuild": "node scripts/standardize-firebase-config.mjs"` to your production repo's `package.json` so Cloud Build automatically materializes `firebase-applet-config.json` from `FIREBASE_APPLET_CONFIG_JSON` before `vite build`.
3. Provision secrets and link the backend:
```bash
npx --yes firebase-tools use gen-lang-client-0822907731
npx --yes firebase-tools apphosting:secrets:set GEMINI_API_KEY
npx --yes firebase-tools apphosting:secrets:set VECL_ADMIN_MASTER_PIN
npx --yes firebase-tools apphosting:secrets:set FIREBASE_APPLET_CONFIG_JSON
npx --yes firebase-tools apphosting:backends:create --project gen-lang-client-0822907731 --location asia-east1
```

---

## 9. Post-Deployment Verification, Troubleshooting & Rollback

### Production Smoke Checklist
- [ ] HTTPS site loads with zero console or CSP errors; `/manifest.webmanifest` and `/sw.js` return `200 OK`.
- [ ] Google Sign-In succeeds (no `auth/unauthorized-domain`).
- [ ] Firestore reads/writes succeed under `users/<uid>/*` with zero `Missing or insufficient permissions` errors.
- [ ] Oscilloscope transient zoom (`1×–50×` H, `1×–10×` V, drag-box auto-HOLD, minimap scrubber) operates smoothly.
- [ ] Fault Builder offline save queues cleanly and displays the Lab Status footer sync indicator, then auto-flushes when back online.
- [ ] Server-side AI diagnostic route responds cleanly using the Cloud Run / App Hosting `GEMINI_API_KEY` secret.

### Common Migration Issues & Fixes
| Symptom | Root Cause | Fix |
|---|---|---|
| `Missing or insufficient permissions` on Firestore | Rules not deployed to named DB `ai-studio-autoelectriclabp-...` or client connected to `(default)` | Run `npm run firebase:standardize:check` and `npm run rules:deploy` |
| `Vite build failed: Could not resolve "../../firebase-applet-config.json"` | File is gitignored and wasn't bootstrapped in CI/clone | Run `npm run firebase:standardize -- --from-cli` (or set `FIREBASE_APPLET_CONFIG_JSON`) before `npm run build` |
| `auth/unauthorized-domain` on Google login | Live hostname missing from Firebase Auth allowlist | Add the Cloud Run / App Hosting domain in Firebase Console → Authentication → Settings → Authorized domains |
| Container exits or 503 on Cloud Run | Missing `NODE_ENV=production` or `dist/` not built | Verify `Dockerfile` runs `npm run build` and sets `ENV NODE_ENV=production` |

### Instant Rollback Commands
```bash
# 1. Roll back Cloud Run traffic to previous healthy revision
gcloud run revisions list --service autoelectric-lab-pro --project gen-lang-client-0822907731 --region asia-southeast1
gcloud run services update-traffic autoelectric-lab-pro \
  --project gen-lang-client-0822907731 --region asia-southeast1 --to-revisions=PREVIOUS_REVISION_NAME=100

# 2. Revert merge commit safely on main
git checkout main && git pull --ff-only origin main
git revert -m 1 <MERGE_COMMIT_SHA> && git push origin main

# 3. Roll back Firestore rules from previous tag
git checkout <PREVIOUS_TAG> -- firestore.rules && npm run rules:deploy
```
