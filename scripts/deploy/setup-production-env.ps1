<#
SPDX-License-Identifier: MIT
Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations

Production Environment & Firebase Project Setup (Windows PowerShell)
Usage:
  powershell -ExecutionPolicy Bypass -File scripts\deploy\setup-production-env.ps1 [-FromCli] [-DeployRules]
#>

[CmdletBinding()]
param(
  [switch]$FromCli,
  [switch]$DeployRules
)

$ErrorActionPreference = "Stop"

$ProjectId   = "gen-lang-client-0822907731"
$FirestoreDb = "ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Autoelectric Lab Pro — Production Environment Setup (PowerShell)" -ForegroundColor Cyan
Write-Host " Firebase Project: $ProjectId"
Write-Host " Firestore DB:     $FirestoreDb"
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Verify required toolchains
foreach ($tool in @("node", "npm", "git")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Required tool '$tool' is not installed or not in PATH."
  }
}

$nodeVer = (node -v).Trim()
$npmVer  = (npm -v).Trim()
$gitVer  = (git --version).Trim()
Write-Host "[1/5] Node $nodeVer | npm $npmVer | $gitVer"

# 2. Prepare local .env from .env.example without overwriting existing secrets
if (-not (Test-Path ".env")) {
  if (-not (Test-Path ".env.example")) {
    throw ".env.example not found in repository root."
  }
  Copy-Item ".env.example" ".env"
  Write-Host "[2/5] Created .env from .env.example (fill in GEMINI_API_KEY and VECL_ADMIN_MASTER_PIN; never commit .env)." -ForegroundColor Yellow
} else {
  Write-Host "[2/5] Existing .env preserved (not overwritten)."
}

# 3. Install dependencies if node_modules is missing
if (-not (Test-Path "node_modules")) {
  Write-Host "[3/5] Installing npm dependencies..."
  if (Test-Path "package-lock.json") {
    npm ci
  } else {
    npm install
  }
} else {
  Write-Host "[3/5] node_modules already present."
}

# 4. Link Firebase CLI & standardize firebase-applet-config.json
Write-Host "[4/5] Linking repository to Firebase project $ProjectId..."
try {
  npx --yes firebase-tools use $ProjectId
} catch {
  Write-Warning "Firebase CLI project selection skipped (run 'npx firebase-tools login' if not authenticated)."
}

if ($FromCli) {
  node scripts/standardize-firebase-config.mjs --from-cli
} else {
  node scripts/standardize-firebase-config.mjs
}
if ($LASTEXITCODE -ne 0) { throw "Failed to standardize firebase-applet-config.json." }

# 5. Run quick pre-merge & rules verification (and optional rules deploy)
Write-Host "[5/5] Running quick release & Firestore rules verification..."
npm run release:check:quick
if ($LASTEXITCODE -ne 0) { throw "Quick preflight verification failed." }

if ($DeployRules) {
  Write-Host "Deploying Firestore security rules & indexes to $FirestoreDb..."
  npx --yes firebase-tools deploy --only firestore:rules --database $FirestoreDb --project $ProjectId
  if ($LASTEXITCODE -ne 0) { throw "Firestore rules deployment failed." }
  npx --yes firebase-tools deploy --only firestore:indexes --database $FirestoreDb --project $ProjectId
  if ($LASTEXITCODE -ne 0) { throw "Firestore indexes deployment failed." }
}

Write-Host "Done! Next step: run 'npm run release:check' before merging to main." -ForegroundColor Green
