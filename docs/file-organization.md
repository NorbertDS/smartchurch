# File Organization Rules

This project follows a clear, maintainable structure. Use these rules for new files and when reorganizing existing ones.

## Directories

- `frontend/`
  - `src/pages/` — Route pages and section screens
  - `src/components/` — Reusable UI components
  - `src/templates/` — Layout wrappers such as `SectionLayout`
  - `src/styles/` — Global CSS files (`base.css`, `accessibility.css`), imported by `index.css`
  - `src/api/` — HTTP clients and API helpers
  - `assets/` — Static assets bundled by Vite (images, icons)
- `backend/`
  - `src/routes/` — Express route modules
  - `src/services/` — Business logic and helpers
  - `src/config/` — Configuration (Prisma, middleware)
  - `uploads/` — Publicly served uploaded files (councils, committees, minutes)
- `docs/` — Documentation for architecture, styling, and QA

## Naming Convention

- Use PascalCase for React components and TypeScript types.
- Use camelCase for variables and functions.
- Use kebab-case for filenames within `assets/` and uploaded files.

## Asset Versioning

- Council and Committee uploads store a JSON `index.json` per entity with `version` incremented per `originalname`.
- Prefer re-uploading with the same `originalname` to maintain a clean version history.

## Documentation

- Keep high-level docs in `docs/` and cross-link from READMEs.

## Metadata & SEO

- Section pages use `SectionLayout` to set `document.title` and `meta[name=description]`.

## Accessibility

- `SectionLayout` includes a skip link and focus-visible outlines via `accessibility.css`.

## Performance

- Optimize images (`assets/`) and prefer `loading="lazy"` where applicable.

