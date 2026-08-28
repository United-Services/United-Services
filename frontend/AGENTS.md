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
- `public/images/` — static image assets. Large/hero photography on the
  public marketing pages (Home, About, Vision, Projects) uses `next/image`
  (`fill` + a `position: relative` wrapper for layouts that were
  `position: absolute` + `inset: 0`, or explicit `width`/`height` props
  for fixed-pixel-size images) for automatic resizing/format negotiation
  at scale — see `next.config.mjs`'s `images.remotePatterns` for the one
  external source (Unsplash) that needs it. Small decorative marks
  (client-logo marquees, company logos) and any image whose `src` is a
  dynamic S3 presigned URL (service hero images, candidate documents —
  unknown domain/host at build time, and the URL's signature changes
  every request) are deliberately left as plain `<img>` — `next/image`
  can't optimize either case usefully, and for the S3 case doesn't know
  the bucket hostname ahead of time to allowlist it.

## Conventions

- Every view/component that uses state, effects, or event handlers is a
  Client Component (`'use client'` at the top of the file).
- Navigation between views/pages goes through `useAppNavigate()`, not
  `next/link`/`useRouter` directly, so the existing `onNavigate` prop
  contract in `src/views/*` doesn't need to change.
- Use double quotes for strings containing apostrophes, or escape them in
  single-quoted strings — an unescaped apostrophe breaks the build.

## Local development

Prerequisites: Node 22+, npm, and a Clerk application (dev instance keys
are fine locally). The backend should be running too (see
`backend/AGENTS.md`) for API calls to resolve.

```bash
cd frontend
# Create .env.local with at least:
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
#   CLERK_SECRET_KEY=
#   NEXT_PUBLIC_API_URL=http://localhost:3002/api/v1
npm install
npm run dev                  # http://localhost:3000
```

`.npmrc` sets `legacy-peer-deps=true` — `react-simple-maps` declares a
stale React 16–18 peer range that doesn't reflect the React 19 actually
in use; without this every `npm install`/`npm ci` fails with `ERESOLVE`.

## Testing, linting, and type-checking

```bash
npm run lint
npx vitest run
npx tsc --noEmit
npm run build
```

CI runs the same checks — see `.github/workflows/ci.yml`. E2E tests
(Playwright, `e2e/`) run against a real running stack, not part of the
standard CI job — see `playwright.config.ts`.

## Commands

- `npm run dev` — start the Next.js dev server (`next dev`).
- `npm run build` — production build (`next build`).
- `npm start` — run the production build (`next start`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
