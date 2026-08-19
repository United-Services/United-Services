"use client"

import { AnimatePresence, motion } from "framer-motion"
import { usePathname } from "next/navigation"
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion"

interface Props {
  children: React.ReactNode
}

// Wraps every route's content so moving between pages (Home → About →
// Services, etc.) is a soft crossfade + rise instead of a hard cut. Keyed
// on pathname so AnimatePresence treats each route as a distinct child
// and actually runs the exit transition before the next page mounts.
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
        key={pathname}
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
