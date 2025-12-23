FaithConnect (SmartChurch) – Project Documentation

**Overview**
- Full-stack church management system with a React frontend and Express/Prisma backend.
- Frontend runs on `http://localhost:5173`; backend on `http://localhost:4000` by default.
- Database uses Prisma with `sqlite` provider; dev DB located at `backend/prisma/data/dev.db`.

**Architecture**
- Frontend: React + TypeScript + Vite + Tailwind (`frontend/`).
- Backend: Node.js + Express + Prisma ORM (`backend/`).
- Static uploads are served from `backend/uploads` under `GET /uploads/*`.
- Settings and configuration are persisted via the `Setting` model (key/value JSON).

**Quick Start**
- Prerequisites: Node.js 18+, npm, and Git.
- Backend:
  - `cd backend`
  - `npm install`
  - Create `.env` (see Env Vars below).
  - `npx prisma migrate dev`
  - `npm run dev`
- Frontend:
  - `cd frontend`
  - `npm install`
  - `npm run dev`
- Verify health:
  - Visit `http://localhost:4000/health` → returns `{ status: 'ok' }` when DB reachable.
  - Frontend preview is accessible at `http://localhost:5173/`.

**Environment Variables (Backend)**
- `DATABASE_URL`: Prisma database connection string. Example (SQLite): `file:./prisma/data/dev.db`.
- `PORT`: Backend port. Default `4000`.
- `JWT_SECRET`: Secret for signing auth tokens. Required in production.
- `BACKUP_DIR`: Directory to store backup JSON files. Default `backend/prisma/backups`.
- `BACKUP_INTERVAL_MINUTES`: Automated backup interval. Default `60` minutes.
- `OPENAI_API_KEY`: Enables AI endpoints under `/ai`. Optional.
- `PAYPAL_CLIENT_ID`: Enables `paypal` in `/payments/config`. Optional.
- `STRIPE_PUBLIC_KEY`: Enables `stripe` in `/payments/config`. Optional.
- `MPESA_SHORTCODE`: Enables `mpesa` in `/payments/config`. Optional.
- `QR_SECRET`: Secret for QR code generation; falls back to `JWT_SECRET`.
- `PROVIDER_ADMIN_EMAIL`: Superadmin login email for provider-level admin (recommended to set).
- `PROVIDER_ADMIN_PASSWORD`: Superadmin login password (recommended to set; use a strong value).
- `PROVIDER_ADMIN_NAME`: Display name for the provider admin (optional).
- `ENABLE_PROVIDER_RESTART`: Allows provider-initiated restarts in production when set to `true`.
- `APP_VERSION`: Human-readable build version (recommended in production).
- `BUILD_SHA`: Git SHA or build identifier (fallback when `APP_VERSION` is unset).
- `BUILD_TIME`: ISO timestamp for build time (recommended in production).
- `EXPECTED_APP_VERSION`: Optional “target” version for update mismatch warnings.

Sample `.env` (backend):
```
DATABASE_URL="file:./prisma/data/dev.db"
PORT=4000
JWT_SECRET="replace-with-strong-secret"
BACKUP_DIR="backend/prisma/backups"
BACKUP_INTERVAL_MINUTES=60
OPENAI_API_KEY=""
PAYPAL_CLIENT_ID=""
STRIPE_PUBLIC_KEY=""
MPESA_SHORTCODE=""
QR_SECRET=""
PROVIDER_ADMIN_EMAIL="provider.admin@example.com"
PROVIDER_ADMIN_PASSWORD="ReplaceWithStrongPassword!"
PROVIDER_ADMIN_NAME="Provider Admin"
```

**Frontend Configuration**
- API base URL is defined in `frontend/src/api/client.ts` as `http://localhost:4000`.
- If the backend runs on a different host/port, update `baseURL` in that file.
- JWTs are stored in `localStorage` under key `fc_token` and attached via `Authorization: Bearer <token>`.

**Authentication**
- Endpoints (`/auth`):
  - `POST /auth/login` → `{ token, role, name }` on success.
  - `POST /auth/register` (Admin only) → create staff users.
  - `POST /auth/public-register` → member self-registration; access gated pending admin approval.
  - `GET /auth/users` (Admin, Clerk) → list users.
  - `PUT /auth/users/:id/role` (Admin) → set role.
  - `DELETE /auth/users/:id` (Admin) → delete user (cannot delete self).
  - `PATCH /auth/me/password` → change own password.
  - `PATCH /auth/users/:id/password` (Admin, Clerk) → reset any user password.
- Bootstrap dev helpers: `POST /auth/bootstrap-admin`, `POST /auth/create-admin` with `x-admin-bootstrap: faithconnect-dev`.
- Provider superadmin (PROVIDER_ADMIN): set `PROVIDER_ADMIN_EMAIL`, `PROVIDER_ADMIN_PASSWORD`, `PROVIDER_ADMIN_NAME` in `.env` and use:
  - `POST /auth/provider-bootstrap-dev` with header `x-admin-bootstrap: faithconnect-dev` to create if missing using env values.
  - `POST /auth/provider-reset-dev` with the same header to reset to env values.
- Requests to protected routes require `Authorization: Bearer <jwt>`.

**Provider Portal (PROVIDER_ADMIN)**
- The provider portal is intended for system-level administration only (no tenant “in-app” features).
- Allowed functionality:
  - Dashboard viewing (includes deployment verification widgets)
  - Tenant management (`/provider/tenants`, `/provider/tenants/:id/manage`)
  - Tenant config validation (`GET /provider/tenants/:id/config/verify`)
  - Audit log viewing/clearing per tenant (`GET`/`DELETE /provider/tenants/:id/audit-logs`)
  - Controlled maintenance actions (restart and related logs)

**Update Verification & Logs (PROVIDER_ADMIN)**
- Backend version status:
  - `GET /provider/maintenance/version/status` → current version/build metadata + warnings and update mismatch when `EXPECTED_APP_VERSION` is set.
  - `POST /provider/maintenance/version/ack` → records an acknowledgement in audit logs (requires CSRF token).
  - `GET /provider/maintenance/version/logs` → recent verification activity from audit logs.
- Health check (provider-only):
  - `GET /provider/maintenance/health` → validates DB connectivity and returns basic process health information.

**Settings & Configuration**
- Endpoints (`/settings`):
  - `GET/POST/PUT /settings/info` → church info `{ name, sidebarName, logoUrl, contact, location }`.
  - `GET/POST /settings/email` → SMTP config `{ host, port, secure, user, pass }`.
  - `GET/POST /settings/sms` → SMS provider config `{ provider, apiKey, from }`.
  - `GET/POST /settings/templates/ministries` → ministry meeting templates.
  - `GET /settings/backup` → export core tables.
  - `POST /settings/backup` → write backup JSON to disk.
  - `GET /settings/backup/list` → list backups.
  - `POST /settings/backup/restore-by-member` → restore selected entities by member name.
  - `POST /settings/restore` → non-destructive restore of selected entities.
  - `GET /settings/consistency` → data consistency report.
  - Titles management:
    - `GET /settings/titles/:key` → get a page heading by key.
    - `PUT /settings/titles/:key` (Admin) → set heading (≤ 50 chars).
    - `GET /settings/titles/:key/history` (Admin) → basic history snapshot.
  - Status lists:
    - `GET/POST /settings/spiritual-statuses` → customize list.
    - `GET/POST /settings/membership-statuses` → customize list.
  - Member import columns:
    - `GET /settings/member-import/columns` → current column configuration for CSV/XLSX uploads.
    - `POST /settings/member-import/columns` (Admin) → update columns. Payload: array of `{ key, label, required, type, enumValues?, aliases? }`. Changes are audit-logged.
    - Defaults match Members table columns: Required `First Name`, `Last Name`, `Gender`; Optional `Contact`, `Status`, `Joined`, `Address`, `Membership Number`.

**Payments**
- Endpoint (`/payments/config`) returns enabled providers and public identifiers based on env vars.
- Webhook stub: `POST /payments/webhook/:provider` acknowledges events; add signature verification per provider when integrating.

**Attendance & QR Codes**
- QR signing uses `QR_SECRET` or `JWT_SECRET`.
- Attendance endpoints reference members/events; integrity validated via `/settings/consistency`.

**Minutes & Versioning**
- Board and Business minutes support versioning and approval workflow in the schema.
- Files are stored with paths; text extraction and advanced workflows can be added as needed.

**Centralized Titles Management (Frontend UI)**
- Inline title editing was removed from pages; all headings are display-only.
- Manage page titles in Settings → “Titles” tab:
  - Keys include `attendance`, `reports`, `sermons`, `finance`, `ministries`, `events`.
  - Each title is validated client-side and saved to `/settings/titles/:key`.
- Church Info continues to manage `Name` (header) and `Sidebar Title` (sidebar header) via `/settings/info`.

**Development Workflow**
- Backend dev server: `cd backend && npm run dev`.
- Frontend dev server: `cd frontend && npm run dev`.
- Hot Module Replacement (HMR) updates frontend automatically.
- Backups run on a schedule (env `BACKUP_INTERVAL_MINUTES`) and write to `BACKUP_DIR`.

**Troubleshooting**
- Frontend shows `net::ERR_CONNECTION_REFUSED`:
  - Ensure backend is running: `http://localhost:4000/health` should return `{ status: 'ok' }`.
  - Confirm `frontend/src/api/client.ts` `baseURL` points to the backend host/port.
  - Check CORS and firewall rules on the backend host.
- Auth issues (401/403):
  - Verify `Authorization: Bearer <token>` header is set; frontend stores token under `fc_token`.
  - Ensure `JWT_SECRET` is set (identical across services using JWT).
- Database:
  - Confirm `DATABASE_URL` is configured; for SQLite it should point to `file:./prisma/data/dev.db`.
  - Run migrations with `npx prisma migrate dev` after schema changes.
- Backups:
  - Verify `BACKUP_DIR` exists or let the app create it.
  - Use `/settings/backup/list` to see available files.

**Bulk Member Upload (CSV/XLSX)**
- Upload panel (Members page) supports CSV and Excel. Selected file name displays after choosing a file.
- Preview validates against the dynamic column configuration above and supports header aliases (e.g., `Name` splits into `First Name` + `Last Name`, `Status` → `Spiritual Status`, `Joined` → `Date Joined`).
- Unknown admin-defined columns not in the Member model are stored under `abilities.extras`.
- Import commit upserts by `membershipNumber` when present to preserve backward compatibility.

**Printing**
- Members page uses the browser’s native print dialog.
- Print styles ensure proper table formatting and hide non-essential UI.

**Project Structure**
- `backend/` → Express API, Prisma schema, services, routes.
- `frontend/` → React app, pages, components, API client.
- `backend/prisma/data/dev.db` → local SQLite dev database.
- `backend/prisma/backups/` → JSON backups directory.
- `backend/uploads/` → static files served under `/uploads`.

**Notes**
- Some routes enforce role-based access via `requireRole([ ... ])`.
- When deploying, set strong secrets and review provider env vars for payments and AI.
- Consider externalizing frontend API base URL via environment variables if deploying across different hosts.

**Deployment**
- Overview:
  - Backend is Node.js/Express (TypeScript) and serves API plus static uploads under `/uploads/*`.
  - Frontend is React/Vite (TypeScript); build artifacts live in `frontend/dist` for static hosting.
  - Dev uses SQLite; for production, prefer Postgres or MySQL supported by Prisma.

- Backend (Production):
  - Set environment:
    - `JWT_SECRET` to a strong value.
    - `DATABASE_URL` to a production database (e.g., Postgres: `postgresql://user:pass@host:5432/db?schema=public`).
    - Optional: `BACKUP_DIR`, `OPENAI_API_KEY`, payment provider keys.
  - Build and migrate:
    - `cd backend`
    - `npm install`
    - Update Prisma datasource provider (if switching from SQLite) in `backend/prisma/schema.prisma` and run `npx prisma migrate deploy`.
    - `npm run build` then `npm start`.
  - Ensure persistent storage for `backend/uploads` and backups; mount a volume or use object storage if needed.

- Frontend (Production):
  - Set API base URL:
    - Provide `VITE_API_BASE_URL` at build time to point to your backend (e.g., `https://api.example.com`).
  - Build static site:
    - `cd frontend`
    - `npm install`
    - `VITE_API_BASE_URL=https://api.example.com npm run build`
  - Deploy `frontend/dist` to a static host (CDN/HTTP server). Ensure SPA routing falls back to `index.html`.

- Recommended Platforms:
  - Starter (quick deploy):
    - Render (Backend: Node service; Frontend: Static site). Simple env management and free tiers.
    - Railway (Backend/DB: Node service + Postgres). Easy provisioning for starters.
  - Intermediate:
    - Fly.io (Global apps; deploy backend as Docker; static frontend via Fly or CDN).
    - DigitalOcean App Platform (Backend service + managed Postgres; static frontend).
  - Advanced:
    - Docker Compose (Backend + Postgres + reverse proxy). Self-hosted VM or on-prem.
    - Kubernetes (EKS/GKE/DO): Backend Deployment + Service/Ingress; managed Postgres; CI/CD integration.

- Example Configuration Tips:
  - CORS: ensure your backend accepts requests from your frontend origin.
  - TLS/HTTPS: terminate TLS at your platform or reverse proxy.
  - Environment propagation: set `VITE_API_BASE_URL` for the frontend and `JWT_SECRET`, `DATABASE_URL` for backend.
  - Tenant header: frontend automatically sets `x-tenant-id` from `localStorage` (`fc_tenant_id`) on requests.
