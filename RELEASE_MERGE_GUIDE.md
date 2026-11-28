# Autoelectric Lab Pro — Release Merging & Publish Command Guide

This handbook provides copy-paste-ready commands for **Windows Command Prompt (CMD)**, **Windows PowerShell**, and **Linux / macOS Bash** to transfer all recent development work into your published GitHub `main` branch and deploy the full-stack application to **Google Cloud Run** or **Firebase App Hosting**.

| Target Setting | Value |
|---|---|
| **Package Name** | `autoelectric-lab-pro` |
| **Git Publish Branch** | `main` (merged via dedicated `release/*` branch) |
| **Firebase Project ID** | `gen-lang-client-0822907731` |
| **Firestore Database ID** | `ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82` |
| **Cloud Run Region** | `asia-southeast1` |
| **Runtime Server Entry** | `server.ts` (`NODE_ENV=production npm start`, binds `0.0.0.0:$PORT`) |
| **Pre-Merge Gate Command** | `npm run release:check` (or `npm run release:check:quick`) |

---

## 0. Release Payload Summary (Work Being Transferred)

| Area | Summary of Updates Included |
|---|---|
| **Oscilloscope Transient Zoom** | Lab-bench horizontal (`1×–50×`) & vertical (`1×–10×`) zoom, drag-box transient capture with auto-HOLD, cursor-anchored wheel zoom, pan, hover probe HUD, calibrated `µs/div`–`ms/div` grid, and minimap scrubber across `Oscilloscope.tsx`, `D3OscilloscopeView.tsx`, `PinWaveformOscilloscope.tsx`, `OscilloscopeZoomControls.tsx`, `oscilloscopeZoomUtils.ts`, and `SignalGenerator.ts`. |
| **Firebase & Firestore Rules** | Re-provisioned project/database alignment (`gen-lang-client-0822907731` / `ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82`), direct client config binding in `src/lib/firebase.ts`, and verified owner-scoped `firestore.rules` + `firebase-blueprint.json`. |
| **Fault Builder Offline Sync** | Optimistic IndexedDB sync queue with exponential-backoff auto-retry on Firestore background failures and non-intrusive sync status indicator in `LabStatusFooter`. |
| **AI Resilience & Security** | Multi-key Gemini `QuotaManager` rotation, WebSocket Origin hardening, rate limiting, `safeExternalUrl.ts`, in-memory lease tokens, sanitized error responses, and MIT SPDX headers. |
| **Release Automation** | Cross-platform pre-merge preflight gate (`scripts/preflight-release-check.mjs`, `npm run release:check`). |

---

## 1. Prerequisites & CLI Authentication

Run these once on your workstation to confirm Node.js (v20+), Git, Firebase CLI, and Google Cloud CLI are ready and pointed at `gen-lang-client-0822907731`.

### Windows Command Prompt (CMD)
```cmd
node -v && npm -v && git --version
npx --yes firebase-tools --version
gcloud --version

npx --yes firebase-tools login
gcloud auth login
gcloud config set project gen-lang-client-0822907731
```

### Windows PowerShell
```powershell
node -v; npm -v; git --version
npx --yes firebase-tools --version
gcloud --version

npx --yes firebase-tools login
gcloud auth login
gcloud config set project gen-lang-client-0822907731
```

### Linux / macOS Bash
```bash
node -v && npm -v && git --version
npx --yes firebase-tools --version
gcloud --version

npx --yes firebase-tools login
gcloud auth login
gcloud config set project gen-lang-client-0822907731
```

---

## 2. Transfer & Merge Workspace Changes into GitHub `main`

Because the AI Studio export folder does not include `.git`, **never** delete or overwrite your published repository's `.git` directory. Instead, cut a fresh release branch from `origin/main` and overlay only tracked source/config files while excluding `.git`, `node_modules`, `dist`, `.env*`, `.data`, `.aistudio`, `public/assets/aistudio`, and `firebase-applet-config.json`.

> Replace the two placeholder paths below with your real local folder paths:
> - `PUBLISHED_REPO` = your local clone of the published GitHub repo (contains `.git`)
> - `EXPORT_DIR` = the unzipped folder downloaded/exported from AI Studio

### Step 2.1 — Sync `main` and Create a Release Branch

#### Windows Command Prompt (CMD)
```cmd
set "PUBLISHED_REPO=C:\Projects\autoelectric-lab-pro"
set "EXPORT_DIR=C:\Downloads\autoelectric-lab-pro-export"
set "RELEASE_BRANCH=release/2026-11-scope-zoom-firebase-sync"

cd /d "%PUBLISHED_REPO%"
git status
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b %RELEASE_BRANCH%
```

#### Windows PowerShell
```powershell
$PUBLISHED_REPO = "C:\Projects\autoelectric-lab-pro"
$EXPORT_DIR     = "C:\Downloads\autoelectric-lab-pro-export"
$RELEASE_BRANCH = "release/2026-11-scope-zoom-firebase-sync"

Set-Location $PUBLISHED_REPO
git status
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b $RELEASE_BRANCH
```

#### Linux / macOS Bash
```bash
export PUBLISHED_REPO="$HOME/Projects/autoelectric-lab-pro"
export EXPORT_DIR="$HOME/Downloads/autoelectric-lab-pro-export"
export RELEASE_BRANCH="release/2026-11-scope-zoom-firebase-sync"

cd "$PUBLISHED_REPO"
git status
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b "$RELEASE_BRANCH"
```

---

### Step 2.2 — Safe Overlay Sync (Preserves `.git` and Local Secrets)

> **Important for Windows `robocopy`:** `robocopy` returns exit codes `0` through `7` on success (only `8` or higher indicates an error). Do **not** use `/MIR` if your published repo has extra CI workflows (such as `.github/workflows/`) that are not in the export; `/E` safely updates and adds files without deleting `.github/`.

#### Windows Command Prompt (CMD)
```cmd
robocopy "%EXPORT_DIR%" "%PUBLISHED_REPO%" /E ^
  /XD ".git" "node_modules" "dist" "build" ".data" ".aistudio" "public\assets\aistudio" ".vscode" ^
  /XF ".env" ".env.local" ".env.production" ".env.development" "firebase-applet-config.json" "*.log" "*.tmp" "*.bak" "*.zip" "*.pdf"
if errorlevel 8 (echo ROBOCOPY FAILED & exit /b 1) else (echo Overlay sync completed safely.)
```

#### Windows PowerShell
```powershell
robocopy $EXPORT_DIR $PUBLISHED_REPO /E `
  /XD ".git" "node_modules" "dist" "build" ".data" ".aistudio" "public\assets\aistudio" ".vscode" `
  /XF ".env" ".env.local" ".env.production" ".env.development" "firebase-applet-config.json" "*.log" "*.tmp" "*.bak" "*.zip" "*.pdf"
if ($LASTEXITCODE -ge 8) { throw "Robocopy failed with exit code $LASTEXITCODE" }
Write-Host "Overlay sync completed safely."
```

#### Linux / macOS Bash
```bash
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
  "$EXPORT_DIR/" "$PUBLISHED_REPO/"
```

---

### Step 2.3 — Install Dependencies, Inspect Diff & Review High-Risk Files

Run this in any shell (CMD, PowerShell, or Bash) inside `%PUBLISHED_REPO%` / `$PUBLISHED_REPO`:

```bash
npm install
git status -sb
git diff --stat
```

**High-Risk Merge Review Checklist** (inspect these specifically if your published `main` had custom changes):
```bash
git diff -- package.json .gitignore .firebaserc firebase.json firestore.rules firebase-blueprint.json
git diff -- server.ts src/lib/firebase.ts
```
- Confirm `package.json` keeps `"start": "tsx server.ts"`, `"build": "vite build"`, `"rules:verify"`, `"rules:deploy"`, and `"release:check"`.
- Confirm `.gitignore` still excludes `.env*`, `!.env.example`, `.data/`, `.aistudio/`, `public/assets/aistudio/`, and `firebase-applet-config.json`.
- Confirm `.firebaserc` points to `gen-lang-client-0822907731` and `firebase.json` points to `ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82`.
- Confirm your local `firebase-applet-config.json` exists before running the build step (see **Section 3** below).

---

### Step 2.4 — Run the Automated Pre-Merge Preflight Gate

Run this before committing or pushing. It checks secret hygiene, Git tracking safety, Firebase project/database alignment, Firestore rules lint, TypeScript types, Vite production build, and all 17 simulation/security test suites.

#### All Shells (CMD, PowerShell, Bash)
```bash
# Full pre-merge gate (recommended before every PR/merge)
npm run release:check

# Fast hygiene + rules + TypeScript check only
npm run release:check:quick
```

Do **not** proceed to Step 2.5 until `npm run release:check` prints:
`RESULT: READY TO MERGE & PUBLISH`

---

### Step 2.5 — Commit, Push, Merge to `main`, and Tag Release

#### Option A — Push Branch & Merge via GitHub Pull Request (Recommended)
```bash
git add -A

# Final check: ensure NO secrets or ignored files are staged
git diff --cached --name-only

git commit -m "release: oscilloscope transient zoom, Firestore rules hardening, offline fault sync retry"
git push -u origin release/2026-11-scope-zoom-firebase-sync
```
Then open and merge the PR in GitHub (or via GitHub CLI):
```bash
gh pr create --base main --head release/2026-11-scope-zoom-firebase-sync \
  --title "Release: Oscilloscope Transient Zoom, Firestore Rules & Offline Sync" \
  --body "Verified with npm run release:check (all 7 gates and 17 test suites passing)."
```

#### Option B — Direct Local Merge into `main` + Annotated Tag
```bash
git add -A
git diff --cached --name-only
git commit -m "release: oscilloscope transient zoom, Firestore rules hardening, offline fault sync retry"

git checkout main
git pull --ff-only origin main
git merge --no-ff release/2026-11-scope-zoom-firebase-sync -m "Merge release/2026-11-scope-zoom-firebase-sync into main"

# If Git reports merge conflicts:
#   1. Inspect conflicted files:  git status
#   2. Resolve markers (<<<<<<< ======= >>>>>>>) in your editor
#   3. Re-run:                    npm run release:check
#   4. Finalize merge:            git add -A && git commit

git tag -a v1.4.0 -m "Autoelectric Lab Pro v1.4.0 — Scope Zoom, Firestore Rules & Sync Hardening"
git push origin main --follow-tags
```

---

## 3. Secret Hygiene & `firebase-applet-config.json` Bootstrap

### Crucial Build-Time Detail
`src/lib/firebase.ts` imports `../../firebase-applet-config.json` directly so the production frontend is strictly bound to project `gen-lang-client-0822907731` and database `ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82`. Meanwhile, `.gitignore` intentionally excludes `firebase-applet-config.json` so workspace credentials are never pushed to GitHub.

Therefore, on a fresh GitHub clone (or inside Cloud Build / App Hosting CI), you must bootstrap `firebase-applet-config.json` locally **before** running `npm run build` — while keeping it untracked by Git.

### Create Local `firebase-applet-config.json` (Never Commit)

#### Windows Command Prompt (CMD)
```cmd
if not exist "firebase-applet-config.json" copy "firebase-applet-config.example.json" "firebase-applet-config.json"
notepad firebase-applet-config.json
```

#### Windows PowerShell
```powershell
if (-not (Test-Path "firebase-applet-config.json")) {
  Copy-Item "firebase-applet-config.example.json" "firebase-applet-config.json"
}
notepad firebase-applet-config.json
```

#### Linux / macOS Bash
```bash
if [ ! -f "firebase-applet-config.json" ]; then
  cp firebase-applet-config.example.json firebase-applet-config.json
fi
```

Fill in the public Firebase Web App fields from **Firebase Console → Project settings → Your apps → `ai-studio-applet-webapp`** (for `gen-lang-client-0822907731`):
- `projectId`: `"gen-lang-client-0822907731"`
- `firestoreDatabaseId`: `"ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82"`
- `apiKey`, `appId`, `authDomain`, `storageBucket`, `messagingSenderId`: exact values from Firebase Console.

Verify Git still ignores it:
```bash
git check-ignore -v firebase-applet-config.json
```

### Server-Side Environment Variables (Configure in Cloud Run / App Hosting Only — Never in Git)

| Variable | Scope | Purpose |
|---|---|---|
| `NODE_ENV` | Server runtime | Set to `production` so Express serves built SPA from `dist/` |
| `APP_URL` | Server runtime | Your published HTTPS URL (e.g., `https://autoelectric-lab-pro-xxxx.a.run.app`) |
| `GEMINI_API_KEY` | Server secret | Primary Gemini API key (never prefix with `VITE_`) |
| `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` | Server secret (optional) | Extra keys for automatic `QuotaManager` rotation |
| `VECL_ADMIN_MASTER_PIN` | Server secret | Master Admin PIN for the 3–6 hour Trial PIN generator (required in production) |
| `VECL_ADMIN_UIDS` | Server runtime | Comma-separated Firebase UIDs granted Admin License Console access |
| `VECL_DATA_DIR` | Server runtime | Persistent volume directory (e.g. `/var/lib/autoelectric`) for trial, license, and revocation state |
| `VECL_LICENSE_HMAC_SECRET` | Server secret | 32+ char HMAC signing secret (required with `VECL_STRICT_PRODUCTION_SECRETS=true`) |
| `AELP_LICENSE_SIGNING_PRIVATE_KEY_JWK` | Server secret | ECDSA P-256 JWK private key for offline signed licenses |
| `VECL_STRICT_PRODUCTION_SECRETS` | Server runtime | Set to `true` in production to enforce persistent secrets and disable first-run PIN claiming |
| `GEMINI_MODEL` | Server runtime (optional) | Defaults to `gemini-4-hydrogen` |

---

## 4. Deploy Firestore Security Rules & Indexes (`gen-lang-client-0822907731`)

Deploy rules and indexes directly to the named database `ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82`.

### Windows Command Prompt (CMD)
```cmd
npx --yes firebase-tools use gen-lang-client-0822907731
npm run rules:verify
npx --yes firebase-tools deploy --only firestore:rules --database ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82
npx --yes firebase-tools deploy --only firestore:indexes --database ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82
```

### Windows PowerShell
```powershell
npx --yes firebase-tools use gen-lang-client-0822907731
npm run rules:verify
npx --yes firebase-tools deploy --only firestore:rules --database ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82
npx --yes firebase-tools deploy --only firestore:indexes --database ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82
```

### Linux / macOS Bash
```bash
npx --yes firebase-tools use gen-lang-client-0822907731
npm run rules:verify
npx --yes firebase-tools deploy --only firestore:rules --database ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82
npx --yes firebase-tools deploy --only firestore:indexes --database ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82
```

### Mandatory Post-Deploy Auth Domain Step
In **Firebase Console → Project `gen-lang-client-0822907731` → Authentication → Settings → Authorized domains**, click **Add domain** and add your published Cloud Run or Firebase App Hosting hostname (e.g., `autoelectric-lab-pro-xxxx-as.a.run.app` or your custom domain) so Google Sign-In works without `auth/unauthorized-domain` errors.

---

## 5. Publish Full-Stack Application

Because this app runs an Express backend (`server.ts`) with `/api/*` proxy routes and a WebSocket live-voice server alongside the Vite SPA (`dist/`), publish it using **Track 5A (Google Cloud Run)** or **Track 5B (Firebase App Hosting)**.

---

### Track 5A — Google Cloud Run (Recommended for Full-Stack Express + WebSockets)

#### 1. Store Runtime Secrets in Google Secret Manager (One-Time Setup)

**Linux / macOS Bash:**
```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com --project=gen-lang-client-0822907731

printf "%s" "YOUR_REAL_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=- --project=gen-lang-client-0822907731
printf "%s" "YOUR_REAL_ADMIN_MASTER_PIN" | gcloud secrets create VECL_ADMIN_MASTER_PIN --data-file=- --project=gen-lang-client-0822907731
```

**Windows PowerShell:**
```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com --project=gen-lang-client-0822907731

"YOUR_REAL_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=- --project=gen-lang-client-0822907731
"YOUR_REAL_ADMIN_MASTER_PIN" | gcloud secrets create VECL_ADMIN_MASTER_PIN --data-file=- --project=gen-lang-client-0822907731
```

**Windows Command Prompt (CMD):**
```cmd
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com --project=gen-lang-client-0822907731

echo|set /p="YOUR_REAL_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=- --project=gen-lang-client-0822907731
echo|set /p="YOUR_REAL_ADMIN_MASTER_PIN" | gcloud secrets create VECL_ADMIN_MASTER_PIN --data-file=- --project=gen-lang-client-0822907731
```
*(If a secret already exists, replace `secrets create` with `secrets versions add`.)*

#### 2. Add a Production `Dockerfile` in Your Published Repo Root (if not already present)
```dockerfile
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Build-time Vite SPA bundle (requires firebase-applet-config.json to be present in build context)
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
```
> **Note:** Make sure `.dockerignore` excludes `node_modules`, `dist`, `.git`, `.env`, `.env.*`, `.data`, and `.aistudio`, while **allowing** `firebase-applet-config.json` during local `gcloud run deploy --source .` builds so `vite build` bundles the public Firebase client config cleanly.

#### 3. Deploy to Cloud Run (`asia-southeast1`)

**Windows Command Prompt (CMD):**
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

**Windows PowerShell:**
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

**Linux / macOS Bash:**
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

After the first deploy prints the live Service URL, set `APP_URL` to match it:
```bash
gcloud run services update autoelectric-lab-pro \
  --project gen-lang-client-0822907731 \
  --region asia-southeast1 \
  --update-env-vars "APP_URL=https://YOUR-PUBLISHED-SERVICE-URL"
```

---

### Track 5B — Firebase App Hosting (Auto-Deploy from GitHub `main`)

If you prefer automatic deploys every time you merge into GitHub `main`:

#### 1. Add `apphosting.yaml` to Your Published Repo Root
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
    availability:
      - RUNTIME
  - variable: GEMINI_MODEL
    value: gemini-4-hydrogen
    availability:
      - RUNTIME
  - variable: GEMINI_API_KEY
    secret: GEMINI_API_KEY
    availability:
      - RUNTIME
  - variable: VECL_ADMIN_MASTER_PIN
    secret: VECL_ADMIN_MASTER_PIN
    availability:
      - RUNTIME
  - variable: FIREBASE_APPLET_CONFIG_JSON
    secret: FIREBASE_APPLET_CONFIG_JSON
    availability:
      - BUILD
```

#### 2. Bootstrap `firebase-applet-config.json` During App Hosting Cloud Build
Because `firebase-applet-config.json` is gitignored, store the JSON contents in Secret Manager as `FIREBASE_APPLET_CONFIG_JSON` (public web config JSON) and generate the file during build using a small `prebuild` command in your published repo:
```json
"prebuild": "node -e \"const fs=require('fs');if(!fs.existsSync('firebase-applet-config.json')&&process.env.FIREBASE_APPLET_CONFIG_JSON){fs.writeFileSync('firebase-applet-config.json',process.env.FIREBASE_APPLET_CONFIG_JSON);}\""
```

#### 3. Create Backend & Bind Secrets (CMD, PowerShell, or Bash)
```bash
npx --yes firebase-tools use gen-lang-client-0822907731
npx --yes firebase-tools apphosting:secrets:set GEMINI_API_KEY
npx --yes firebase-tools apphosting:secrets:set VECL_ADMIN_MASTER_PIN
npx --yes firebase-tools apphosting:secrets:set FIREBASE_APPLET_CONFIG_JSON

npx --yes firebase-tools apphosting:backends:create \
  --project gen-lang-client-0822907731 \
  --location asia-east1
```
Follow the interactive prompt to link your GitHub repository and select branch `main`. Every future merge to `main` automatically builds and rolls out.

---

## 6. Post-Merge Smoke Verification & Rollback Playbook

### Post-Deploy Smoke Checklist
1. Open the published HTTPS URL and confirm zero console errors on initial load.
2. Sign in with Google (`rubenllego12@gmail.com`) and verify zero `Missing or insufficient permissions` Firestore errors in DevTools console.
3. Save a bench session and a fault sequence; reload the page and confirm both hydrate cleanly from Firestore (`ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82`).
4. Open the **Oscilloscope** view, test horizontal zoom (`1×–50×`), vertical zoom (`1×–10×`), drag-box transient zoom (auto-HOLD), hover probe HUD, and the minimap scrubber.
5. Open the **Fault Builder**, toggle browser DevTools **Offline**, save a sequence, confirm the **Lab Status footer** shows the queued sync indicator, then return **Online** and confirm automatic retry completes.
6. Test an AI diagnostic query to verify server-side `/api/*` Gemini proxy + `QuotaManager` works with your production secret.
7. Confirm PWA manifest (`/manifest.webmanifest`) and service worker (`/sw.js`) return `200 OK`.

### Fast Rollback Commands

#### Roll Back Cloud Run to the Previous Healthy Revision
```bash
# List recent revisions
gcloud run revisions list \
  --service autoelectric-lab-pro \
  --project gen-lang-client-0822907731 \
  --region asia-southeast1

# Shift 100% traffic back to the previous revision
gcloud run services update-traffic autoelectric-lab-pro \
  --project gen-lang-client-0822907731 \
  --region asia-southeast1 \
  --to-revisions=PREVIOUS_REVISION_NAME=100
```

#### Roll Back Git `main` Merge Cleanly (Preserves History)
```bash
git checkout main
git pull --ff-only origin main
git log -n 5 --oneline
git revert -m 1 <MERGE_COMMIT_SHA>
git push origin main
```

#### Roll Back Firestore Rules to Previous Tag
```bash
git checkout <PREVIOUS_TAG> -- firestore.rules
npm run rules:deploy
```
