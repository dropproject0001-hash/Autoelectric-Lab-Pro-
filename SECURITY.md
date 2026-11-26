# Security Policy

## Supported Releases

| Version | Supported | Security Notes |
| :--- | :---: | :--- |
| 1.x (Current) | :white_check_mark: | Active support and maintenance |
| < 1.0 | :x: | Legacy preview releases |

---

## Security Architecture & Design Principles

### 1. Dual-Tier Authentication & Authorization
- **Server-Side Verification:** All sensitive endpoints (AI image schematic analysis, grounded search, live voice processing, license management, trial PIN creation, and audit log inspection) strictly require valid, unexpired, and unrevoked authentication tokens verified on the backend via Firebase Admin SDK or HMAC-signed session tokens.
- **Client-Side UX:** Local UI prompts and export dialogs serve as user experience nudges. Security-critical resources and upstream AI model quotas are never exposed or unlocked purely via client-side state.

### 2. Admin Claim Lockdown & Secret Management
- First-run unauthenticated Master Admin PIN setup (`/api/autoelectric/trial/admin/setup`) is **disabled by default** via `VECL_ALLOW_FIRST_RUN_ADMIN_SETUP=false`.
- In production, set `VECL_ADMIN_MASTER_PIN` and `VECL_ADMIN_UIDS` directly in your secure server environment.
- Admin session tokens include cryptographically random `jti` identifiers and can be revoked immediately via `/api/autoelectric/trial/admin/logout` or across all active sessions via `/api/autoelectric/trial/admin/revoke-all-sessions`.

### 3. Persistent Data & Secret Storage
- Trial PIN databases, device binding histories, and ECDSA P-256 offline license signing keys are persisted to durable storage specified by `VECL_DATA_DIR` (with fallback to `.data/`).
- File permissions on disk-persisted cryptographic keys are restricted (`0o600`).
- When running in strict production environments (`VECL_STRICT_PRODUCTION_SECRETS=true`), persistent private key JWKs and HMAC secrets must be provided explicitly via environment variables.

### 4. HTTP Headers & Transport Security
- Production responses enforce **Strict-Transport-Security (HSTS)** (`max-age=31536000; includeSubDomains`).
- **Content-Security-Policy (CSP)** restricts scripts, styles, fonts, frames, and connect endpoints to self, Google Fonts, NHTSA APIs, and Firebase endpoints.
- `X-Content-Type-Options: nosniff` and restrictive `Permissions-Policy` headers are applied to all routes.

---

## Reporting a Security Vulnerability

If you discover a security vulnerability within AutoElectric Lab Pro, please report it responsibly:

1. **Email:** Send details directly to `rubenllego12@gmail.com`.
2. **Details to Include:**
   - Description of the vulnerability and affected components.
   - Proof of concept or reproduction steps.
   - Any potential impact on electrical bench safety or credential confidentiality.
3. **Response Timeline:** We acknowledge reports within 48 hours and aim to provide a remediation patch or mitigation within 7 business days.

Please do not open public GitHub issues or forum posts regarding suspected vulnerabilities until a fix has been verified and released.
