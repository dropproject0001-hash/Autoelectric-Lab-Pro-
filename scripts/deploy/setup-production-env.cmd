@echo off
REM SPDX-License-Identifier: MIT
REM Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
REM
REM Production Environment & Firebase Project Setup (Windows Command Prompt / CMD)
REM Usage:
REM   scripts\deploy\setup-production-env.cmd [--from-cli] [--deploy-rules]

setlocal enabledelayedexpansion

set "PROJECT_ID=gen-lang-client-0822907731"
set "FIRESTORE_DB=ai-studio-virtualeculaboem-a394a24c-3180-4bd9-8d2e-ad856ade7828"
set "USE_CLI=0"
set "DEPLOY_RULES=0"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--from-cli" set "USE_CLI=1"
if /I "%~1"=="--deploy-rules" set "DEPLOY_RULES=1"
shift
goto parse_args
:args_done

echo ==================================================================
echo  Autoelectric Lab Pro — Production Environment Setup (Windows CMD)
echo  Firebase Project: %PROJECT_ID%
echo  Firestore DB:     %FIRESTORE_DB%
echo ==================================================================

where node >nul 2>nul || (echo ERROR: Node.js is not installed or not in PATH. & exit /b 1)
where npm >nul 2>nul || (echo ERROR: npm is not installed or not in PATH. & exit /b 1)
where git >nul 2>nul || (echo ERROR: git is not installed or not in PATH. & exit /b 1)

echo [1/5] Checking tool versions...
call node -v
call npm -v
call git --version

if not exist ".env" (
  if not exist ".env.example" (
    echo ERROR: .env.example not found in repository root.
    exit /b 1
  )
  copy ".env.example" ".env" >nul
  echo [2/5] Created .env from .env.example. Fill in GEMINI_API_KEY and VECL_ADMIN_MASTER_PIN; never commit .env.
) else (
  echo [2/5] Existing .env preserved.
)

if not exist "node_modules" (
  echo [3/5] Installing npm dependencies...
  call npm install
  if errorlevel 1 exit /b 1
) else (
  echo [3/5] node_modules already present.
)

echo [4/5] Linking repository to Firebase project %PROJECT_ID%...
call npx --yes firebase-tools use %PROJECT_ID%

if "%USE_CLI%"=="1" (
  call node scripts\standardize-firebase-config.mjs --from-cli
) else (
  call node scripts\standardize-firebase-config.mjs
)
if errorlevel 1 exit /b 1

echo [5/5] Running quick release & Firestore rules verification...
call npm run release:check:quick
if errorlevel 1 exit /b 1

if "%DEPLOY_RULES%"=="1" (
  echo Deploying Firestore security rules & indexes to %FIRESTORE_DB%...
  call npx --yes firebase-tools deploy --only firestore:rules --database %FIRESTORE_DB% --project %PROJECT_ID%
  if errorlevel 1 exit /b 1
  call npx --yes firebase-tools deploy --only firestore:indexes --database %FIRESTORE_DB% --project %PROJECT_ID%
  if errorlevel 1 exit /b 1
)

echo Done! Next step: run "npm run release:check" before merging to main.
endlocal
