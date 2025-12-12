# Styling Decisions and QA Checklist

This guide documents the design system, accessibility standards, and QA steps for section pages.

## Design System

- Typography: base font family and heading rhythm defined in `frontend/src/styles/base.css`.
- Colors: neutral text and muted tones from CSS variables in `base.css`.
- Components: `SectionLayout` provides consistent headers, breadcrumbs, and main content area.
- Inputs and buttons: reuse existing classes (`input`, `btn`, `btn-primary`, `btn-gold`) from `index.css`.

## Accessibility (WCAG)

- Keyboard navigation: `.skip-link` enabled via `accessibility.css`, focus-visible outlines.
- Labels and semantics: Section headers use `<header>` with `aria-label`; main content uses `<main id="main">`.
- Live regions: section description uses `aria-live="polite"` for dynamic updates.

## Responsive Behavior

- Grid layouts use Tailwind utilities (`grid-cols-1 md:grid-cols-2`) for breakpoints.
- Spacing utilities provided in `base.css` (`.space-y-*`).

## Performance

- Prefer `loading="lazy"` for images and external embeds.
- Uploaded assets are served from `/uploads/...`; keep files small and use PDF for documents where possible.

## SEO & Metadata

- `SectionLayout` sets `document.title` and ensures a `meta[name=description]` exists.
- Breadcrumbs can be passed via props to help internal linking.

## QA Checklist

- Validate pages for content parity across sections.
- Test navigation consistency and “Details” links.
- Verify create forms work and show errors gracefully.
- Cross-browser test (Chromium, Firefox, Edge) for inputs and focus styles.
- Run performance audits with Lighthouse focusing on Best Practices and Accessibility.

