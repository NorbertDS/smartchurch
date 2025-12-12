# API: Member Imports and Suggestions

This document summarizes the backend endpoints and DB changes implemented for Member import (CSV/XLSX) and Suggestion Box.

## Database Changes

- Added `Suggestion` model with fields:
  - `id` (Int, PK)
  - `title` (String)
  - `category` (String?)
  - `contentHtml` (String)
  - `attachmentPath` (String?)
  - `status` (Enum: `NEW`, `REVIEWED`, `ACTIONED`, `ARCHIVED`)
  - `createdById` (Int)
  - `createdAt` (DateTime, default `now()`)
- Relation: `User` has `suggestionsCreated` referencing `Suggestion.createdById`.

Migration applied via `npm run prisma:migrate -- --name add_suggestion_model`.

## Member Import Endpoints

Base path: `/members`

- `POST /members/import/preview`
  - Body: `multipart/form-data` with `file` (CSV or XLSX)
  - Validates headers against `Member` model requirements and parses rows.
  - Returns JSON with:
    - `headers` (array)
    - `missingFields` (array)
    - `unknownFields` (array)
    - `validCount`, `invalidCount` (numbers)
    - `rows`: array of `{ rowNumber, data, errors }`
  - Notes:
    - Expected core fields: `firstName`, `lastName`, `gender`, `demographicGroup`, `dob`, `contact`, `address`, `spiritualStatus`, `dateJoined`, `membershipNumber`.
    - Optional fields include: `photoUrl`, `baptized`, `dedicated`, `weddingDate`, `userId`, `departmentId`, `membershipStatus`, `profession`, `talents`, `abilities`, `groupAffiliations`.

- `POST /members/import/commit`
  - Body: JSON `{ rows: Array<ParsedRow> }` from the preview payload where `errors.length === 0`.
  - Behavior:
    - Upserts members by `membershipNumber` if provided; otherwise creates new.
    - Sets `deletedAt` to `null` on upsert to restore soft-deleted records.
  - Returns `{ created: number, updated: number }`.

## Suggestion Endpoints

Base path: `/suggestions`

- `POST /suggestions`
  - Auth: any authenticated user
  - Body: `multipart/form-data`
    - Fields: `title` (required), `category` (optional), `contentHtml` (required), `attachment` (optional file)
  - Stores attachment under `backend/uploads/suggestions/`.
  - Returns created suggestion entry.

- `GET /suggestions`
  - Auth: staff-only (`ADMIN`, `CLERK`, `PASTOR`)
  - Returns `{ items: Suggestion[], canModerate: boolean }`.

- `PATCH /suggestions/:id`
  - Auth: staff-only
  - Body: `{ status: 'NEW' | 'REVIEWED' | 'ACTIONED' | 'ARCHIVED' }`
  - Returns updated suggestion.

## Frontend Notes

- Members page now includes an "Import Members" panel (ADMIN/CLERK):
  - Upload CSV/XLSX, preview validation results, and commit valid rows.

- New "Suggestion Box" page for submitting suggestions with rich text and optional attachment.
  - Staff users can view recent suggestions and moderate status.

