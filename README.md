# AutoElectric Lab Pro

> **Automotive Electronics Diagnostics, Modified Nodal Analysis (MNA) ECU Bench Testing, Real-Time Hardware Twin & AI Diagnostic Workstation**

AutoElectric Lab Pro is an automotive electrical technician software platform engineered for ECU bench testing, circuit simulation, wiring harness diagnostics, pinout verification, oscilloscope analysis, PCB optical inspection, and AI-assisted troubleshooting.

---

## Architecture Overview

- **Frontend & Workstation UI:** React 18, TypeScript, Tailwind CSS, Lucide icons, Motion, Three.js 3D bench twin.
- **Circuit Simulation Engine:** Real-time Modified Nodal Analysis (`MatrixSolver.ts`, `BenchCircuitSolver.ts`) providing mathematically deterministic nodal voltage, current, and impedance calculations with floating-node and singular-matrix protection.
- **Hardware Abstraction & Safety:** `automotiveSafetyGuard.ts` and `benchHardwareAbstractionLayer.ts` enforcing strict separation between simulation-only training models and physical high-risk OEM ECU bench energizing.
- **Backend API & Dev Server:** Express + Vite middlewares (`server.ts`, `createApiApp.ts`), mounted with strict HTTP security headers (CSP, HSTS, X-Content-Type-Options, Permissions-Policy).
- **Authentication & Durable Licensing:**
  - Firebase Authentication + Admin SDK integration (`infra-firefly-1mln4` / `ai-studio-autoelectriclabp-25d98605-c678-411c-adce-09263788ae82`).
  - ECDSA P-256 asymmetric cryptographic offline licenses (`offlineLicenseCrypto.ts`).
  - Single-device timed trial PINs (`trialPinService.ts`) with durable disk persistence configured via `VECL_DATA_DIR`.
  - Immediate server-side admin token revocation via `jti` blacklist and session minimum issued-at timestamps.
  - Unauthenticated first-run admin setup is **disabled in strict production** (`NODE_ENV=production` / `VECL_STRICT_PRODUCTION_SECRETS=true`) and can be explicitly disabled anytime via `VECL_ALLOW_FIRST_RUN_ADMIN_SETUP=false`; in local/preview mode with no `VECL_ADMIN_MASTER_PIN` set, the admin console offers a one-time scrypt-hashed claim form that locks once claimed.

---

## Security Model & Enforcement Boundaries

- **Server-Side Enforcement:**
  - All AI endpoints (`/api/autoelectric/analyze-schematic`, `/api/autoelectric/grounded-search`, `/api/autoelectric/ai/voice-turn`) enforce server-side Firebase Authentication or active signed trial session tokens before request handling.
  - Administrator endpoints (`/api/autoelectric/trial/admin/*`, `/api/autoelectric/license/admin/*`) require verified administrator UID claims (`VECL_ADMIN_UIDS`) or verified Master Admin session tokens.
  - Server endpoints enforce sliding-window IP and user rate limiting.
- **Client-Side UX Guidance:**
  - Client-side modal gates for local data exports and offline guides provide user workflow guidance and subscription prompts. High-value cloud services and Gemini API calls are strictly gated on the backend.

---

## Environment Variables

See `.env.example` for all configurable variables:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | Listening port for the application server | `3000` |
| `VECL_DATA_DIR` | Persistent storage directory for trial store & offline keys | `.data` |
| `VECL_ADMIN_MASTER_PIN` | Server-managed Master Admin PIN | `(unset)` |
| `VECL_ADMIN_UIDS` | Comma-separated Firebase UIDs authorized as server admins | `(unset)` |
| `VECL_ALLOW_FIRST_RUN_ADMIN_SETUP` | Set `false` to disable one-time first-run setup in non-strict preview (always disabled in strict production) | `true` in preview / `false` in prod |
| `VECL_STRICT_PRODUCTION_SECRETS` | Enforce non-empty production signing keys & secrets | `false` |
| `GEMINI_API_KEY` | Google Gemini API key for server-side AI endpoints | `(from Settings > Secrets)` |

---

## Development & Testing

### Prerequisites
- Node.js 20+
- npm 10+

### Install Dependencies
```bash
npm install
```

### Run Development Server
```bash
npm run dev
```

### Run Test Suites
AutoElectric Lab Pro includes 17 test suites covering MNA circuit physics, connection health, automotive safety guards, offline cryptography, and admin authorization:

```bash
npm test
```

### Build for Production
```bash
npm run build
npm start
```
