"use client"

import { AnimatePresence, motion } from "framer-motion"
import { usePathname } from "next/navigation"
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion"

interface Props {
  children: React.ReactNode
}

// Clerk's <SignIn/>/<SignUp/> own their internal step navigation (e.g.
// submitting an email pushes the route from /sign-in to
// /sign-in/factor-one) via the app's router, on the SAME mounted page
// component. Keying AnimatePresence on the raw pathname made that step
// change look like "a new page" to React, unmounting and remounting the
// whole Clerk component tree mid-flow — which threw away Clerk's
// in-progress sign-in attempt and could leave the form showing the wrong
// step (the identifier field again, no password field) until a manual
// refresh re-hydrated it from Clerk's own client cache. Collapsing every
// path under /sign-in or /sign-up to one stable key keeps those internal
// step transitions from remounting anything, while every other route
// still gets its own key (and thus its own animated transition) as
// before.
function transitionKey(pathname: string): string {
  return pathname.replace(/^(\/[a-z]{2})?\/(sign-in|sign-up)(\/.*)?$/, "$1/$2")
}

// Wraps every route's content so moving between pages (Home → About →
// Services, etc.) is a soft crossfade + rise instead of a hard cut.
// Reduced-motion visitors get an instant swap — no animation at all,
// same convention as every other motion primitive on this site (see
// hooks/usePrefersReducedMotion.ts, which this was the reserved use case
// for).
export default function PageTransition({ children }: Props) {
  const pathname = usePathname()
  const reducedMotion = usePrefersReducedMotion()

  if (reducedMotion) return <>{children}</>

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={transitionKey(pathname)}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
