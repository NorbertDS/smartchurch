Backup, Restore, and Consistency Monitoring

Overview
- Scheduled backups run automatically at server startup with interval configured via `BACKUP_INTERVAL_MINUTES` (default `60`).
- Backups are written as JSON to `backend/prisma/backups/` (override with `BACKUP_DIR`).
- Restore is non-destructive: records are upserted by stable unique keys to avoid accidental overwrites.
- Consistency checks detect broken references and common integrity issues for quick monitoring.

Endpoints (all under `/settings` and require authentication)
- `GET /settings/backup` — Export a JSON snapshot of core tables (quick view).
- `POST /settings/backup` — Create a full backup and write it to disk. Response includes `file` and `size`.
- `GET /settings/backup/list` — List available backup files with timestamps and sizes.
- `POST /settings/restore` — Perform non-destructive restore from a backup payload. Response includes a per-entity `summary`.
- `GET /settings/consistency` — Run data consistency validation. Returns `issues[]` and `healthy`.

Scheduler
- Config: `BACKUP_INTERVAL_MINUTES` sets minutes between backups; minimum enforced is 5 minutes.
- Logs: Each run logs the file path written and the number of consistency issues found.

Restore Behavior (Non-Destructive)
- Users: keyed by `email` — update `name`/`role` or create if missing.
- Ministries: keyed by `name` — update `description`.
- Members: matched by `userId` if present, else by `firstName+lastName+dob` — update personal fields.
- Events: keyed by `title+date` — update `description`/`location`.
- Programs: keyed by `name+startDate` — update details.
- CellGroups: keyed by `name` — update details.
- Councils/Committees: keyed by `name` — update details.
- Announcements: keyed by `title+createdAt` — only create if missing.
- Sermons: keyed by `title+date` — update details.

Safety & Validation Notes
- Unique constraints are respected (e.g., `User.email`, `Ministry.name`, `Council.name`, `Committee.name`).
- Timestamps (`createdAt`, `updatedAt`) are preserved when provided; otherwise defaults apply.
- Relationships are rebuilt only when target entities exist; missing references are reported by the consistency endpoint.
- Always inspect `GET /settings/consistency` before and after restores.

Department Meeting Templates
- Dynamic templates are available via `GET /settings/templates/ministries`.
- Update via `POST /settings/templates/ministries` with a JSON object mapping ministry names to arrays of template titles.
- Frontend `Ministries` page loads these templates to avoid hardcoded values.

Manual Recovery Tips
- If a restore fails due to malformed JSON, validate the payload before retrying.
- For selective restore, send only the necessary arrays in the payload (e.g., `{ users: [...], ministries: [...] }`).
- Keep recent backups; do not delete the latest two backup files until you confirm the system is healthy.

