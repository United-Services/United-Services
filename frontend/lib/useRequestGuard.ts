import { useRef } from "react"

// A "latest request wins" guard for async load functions that can be
// re-invoked before their previous call has resolved (mount-time fetch
// racing a user-triggered search/refresh, or two user actions fired in
// quick succession). Without this, a slower earlier response can land
// after a faster later one and silently overwrite fresher state with
// stale data — e.g. searching right after page load, then having the
// unfiltered mount-time response arrive late and wipe out the search
// results. Call start() before the request, then check stale(id) before
// every setState that uses its result (including in the catch branch).
export function useRequestGuard() {
  const ref = useRef(0)
  return {
    start: () => ++ref.current,
    stale: (id: number) => id !== ref.current,
  }
}
