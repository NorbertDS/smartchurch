FaithConnect Frontend Input & Upload Style Guide

Overview
- This guide defines a unified design system for text inputs, selects, textareas, and file uploads to ensure consistent, professional appearance across the application.

Input Elements
- Class: `fc-input` applied globally to `input`, `select`, and `textarea` via CSS.
- Padding: `12px` vertical, `16px` horizontal.
- Border: `1px solid #e0e0e0` with `6px` radius.
- Shadow: `0 2px 4px rgba(0,0,0,0.1)` for subtle depth.
- Transitions: `0.3s ease` for border, shadow, background, and color changes.
- Focus: Blue border (`#2563eb`) and focus ring (`0 0 0 3px rgba(37,99,235,0.2)`), ensuring WCAG contrast.
- Dark Mode: Dark background (`#0f172a`) and adjusted border (`#334155`) with light text.

File Inputs & Dropzone
- File button: consistent padding and hover via `::file-selector-button` styling.
- Dropzone: `fc-dropzone` with dashed border, hover/active feedback, and disabled state.
- Preview: Thumbnail class `fc-thumb` renders a 96x96 image with object-fit cover.
- Validation: Only images (`image/*`) accepted; show clear error messaging.

Spacing & Typography
- Inputs use full width and integrate within `grid`/`flex` layouts.
- Labels use `.text-sm` typography; place inputs with `mt-1` spacing for clarity.

Mobile Responsiveness
- Inputs reduce font size to `14px` below `640px` width.
- Dropzone maintains readable spacing (`16px`) and accessible tap targets.

Accessibility (WCAG 2.1 AA)
- Clear focus states with visible contrast.
- Semantic labels associated with inputs; helper class `.sr-only` for hidden, accessible text.
- Error messages use high-contrast text (e.g., `text-red-600`).

Performance Considerations
- Shadows and transitions kept lightweight (no heavy blurs).
- Avoid repeated large reflows; prefer CSS-only effects.

Usage Examples
- Standard input: `<input class="fc-input" placeholder="Name" />` (optional; base styles apply globally).
- Dropzone: `<div class="fc-dropzone">Drag & drop or click to upload</div>` with an associated hidden file input.

Notes
- Image paths should be absolute: use `api.defaults.baseURL + photoUrl` to load images from the backend (`/uploads/...`).

New Components
- HeaderBrandingTitle
  - Inline-editable branding title located on the left side of the header.
  - Double-click or click to activate edit. Auto-saves on blur or via explicit Save.
  - Validates max 50 characters and non-empty input. Shows visual feedback during saving.
  - Persisted in `localStorage` under `fc_brand_title`. Accessible input with `aria-label`; saving and error messages use `aria-live`.

- SidebarImageManager
  - Displays and manages an image adjacent to the sidebar title at the top.
  - Role-based controls: upload/delete/edit available only for non-`MEMBER` roles.
  - Upload accepts JPG, PNG, SVG; shows loading and error states.
  - Editable properties: alt text, dimensions (24–96px), cropping (`cover`/`contain`).
  - Persisted via `localStorage` keys: `fc_sidebar_img`, `fc_sidebar_img_alt`, `fc_sidebar_img_dims`, `fc_sidebar_img_crop`.
  - Accessibility: Buttons labeled; image uses `alt`; status messages use `aria-live`.

Accessibility & Performance
- Ensure button labels and inputs include descriptive `aria-label`s.
- Maintain contrast and visible focus states per WCAG 2.1 AA.
- Keep operations client-side and lightweight; avoid large images and heavy scripts.
