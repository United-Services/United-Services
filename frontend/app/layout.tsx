// Deliberately does NOT render <html>/<body> — app/[locale]/layout.tsx
// renders its own <html lang={locale}> for every real route, and
// app/not-found.tsx / app/global-error.tsx each render their own
// complete <html>/<body> for the top-level (ungrouped) case. Adding
// markup here would nest a second <html> inside whichever of those
// actually applies.
//
// This file exists purely so a root layout.tsx is present on disk: its
// absence made Next's dev-mode compiler try to auto-generate one for
// app/not-found.tsx (verifyRootLayout() in
// node_modules/next/dist/lib/verify-root-layout.js) and hit a real bug
// there — the auto-create's directory-placement logic pops this file's
// only path segment and then loops over the now-empty array, so it
// silently fails and throws "not-found.tsx doesn't have a root
// layout," which then 500s the whole dev server on every request until
// restarted. A plain passthrough file here satisfies the "does a root
// layout exist" check without ever being asked to render anything,
// since app/[locale]/layout.tsx and the top-level not-found/
// global-error files still own <html>/<body> for their respective
// trees. `next build` was never affected by the bug this works around,
// confirmed clean before and after.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
