#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
#
# Production Environment & Firebase Project Setup (Linux / macOS Bash)
# Usage:
#   chmod +x scripts/deploy/setup-production-env.sh
#   ./scripts/deploy/setup-production-env.sh [--from-cli] [--deploy-rules]

set -euo pipefail

PROJECT_ID="infra-firefly-1mln4"
FIRESTORE_DB="ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82"
USE_CLI=false
DEPLOY_RULES=false

for arg in "$@"; do
  case "$arg" in
    --from-cli) USE_CLI=true ;;
    --deploy-rules) DEPLOY_RULES=true ;;
  esac
done

echo "=================================================================="
echo " Autoelectric Lab Pro — Production Environment Setup (Bash)"
echo " Firebase Project: $PROJECT_ID"
echo " Firestore DB:     $FIRESTORE_DB"
echo "=================================================================="

# 1. Verify required toolchains
for tool in node npm git; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: Required tool '$tool' is not installed or not in PATH." >&2
    exit 1
  fi
done

echo "[1/5] Node $(node -v) | npm $(npm -v) | $(git --version)"

# 2. Prepare local .env from .env.example without overwriting existing secrets
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp ".env.example" ".env"
    echo "[2/5] Created .env from .env.example (fill in GEMINI_API_KEY and VECL_ADMIN_MASTER_PIN; never commit .env)."
  else
    echo "ERROR: .env.example not found in repository root." >&2
    exit 1
  fi
else
  echo "[2/5] Existing .env preserved (not overwritten)."
fi

# 3. Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "[3/5] Installing npm dependencies..."
  npm ci 2>/dev/null || npm install
else
  echo "[3/5] node_modules already present."
fi

# 4. Link Firebase CLI & standardize firebase-applet-config.json
echo "[4/5] Linking repository to Firebase project $PROJECT_ID..."
npx --yes firebase-tools use "$PROJECT_ID" || true

if [ "$USE_CLI" = true ]; then
  node scripts/standardize-firebase-config.mjs --from-cli
else
  node scripts/standardize-firebase-config.mjs
fi

# 5. Run quick pre-merge & rules verification (and optional rules deploy)
echo "[5/5] Running quick release & Firestore rules verification..."
npm run release:check:quick

if [ "$DEPLOY_RULES" = true ]; then
  echo "Deploying Firestore security rules & indexes to $FIRESTORE_DB..."
  npx --yes firebase-tools deploy --only firestore:rules --database "$FIRESTORE_DB" --project "$PROJECT_ID"
  npx --yes firebase-tools deploy --only firestore:indexes --database "$FIRESTORE_DB" --project "$PROJECT_ID"
fi

echo "Done! Next step: run 'npm run release:check' before merging to main."
