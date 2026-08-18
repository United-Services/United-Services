import { useEffect, useState } from "react"

// Single shared source of truth for `prefers-reduced-motion` — every
// scroll-linked or autoplaying animation added for the homepage upgrade
// (well-hero, layer dive, operations map) reads this instead of querying
// the media query itself, so there's one place that gets the SSR-safe
// default (false, matching a static/instant first paint) and the change
// listener right.
export function usePrefersReducedMotion(): boolean {
  // Lazy initializer, not an effect: computes the real value synchronously
  // on the first client render instead of defaulting to false and
  // correcting a render later, which would otherwise mean either a lint
  // violation (setState during an effect body, not in response to an
  // external event) or a one-frame flash of the wrong motion mode.
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  return reduced
}
