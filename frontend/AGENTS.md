# United Services Egypt — Frontend

Next.js (App Router) + React + Tailwind CSS project. A `backend/` service will
be added alongside this app later.

## Project Structure

- `src/app/` — Next.js App Router routes. Each route folder holds a thin
  `page.tsx` that wires a shared navigation hook (and, for `/projects`, the
  `?company=` search param) into the corresponding view under `src/views/`.
- `src/views/` — the actual page implementations (Home, About, Services,
  Projects, Contact, Careers, client/admin portal screens, etc.). Named
  `views` rather than `pages` so Next's file-system router doesn't pick up
  this directory as routes of its own.
- `src/components/` — shared UI (`PublicNav`, `PublicFooter`).
- `src/lib/navigate.ts` — `useAppNavigate()`, a client hook that maps the
  legacy `onNavigate(page, param?)` calls used throughout `src/views/*` to
  real `next/navigation` route pushes (`ROUTES` table + optional
  `?company=` query param for the projects page).
- `src/hooks/useReveal.ts` — scroll-reveal IntersectionObserver hook.
- `src/theme.tsx` — shared color palette and style constants.
- `src/app/layout.tsx` / `src/app/globals.css` — root layout and Tailwind v4
  entrypoint (`@import 'tailwindcss'`).
- `public/images/` — static image assets referenced by plain `/images/...`
  paths (not `next/image`, to keep the original inline-style-driven layouts
  unchanged).

## Conventions

- Every view/component that uses state, effects, or event handlers is a
  Client Component (`'use client'` at the top of the file).
- Navigation between views/pages goes through `useAppNavigate()`, not
  `next/link`/`useRouter` directly, so the existing `onNavigate` prop
  contract in `src/views/*` doesn't need to change.
- Use double quotes for strings containing apostrophes, or escape them in
  single-quoted strings — an unescaped apostrophe breaks the build.

## Commands

- `pnpm dev` — start the Next.js dev server (`next dev`).
- `pnpm build` — production build (`next build`).
- `pnpm start` — run the production build (`next start`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
