// Tiny pub/sub counter of in-flight axios requests, wired into every call
// via lib/api.ts's interceptors below. GlobalLoadingBar subscribes to this
// to show a top progress bar for the whole app — so no page has to
// manually track its own "is something happening" state just to avoid
// looking stuck (rule 15 in docs/BUSINESS_RULES.md covers failures; this
// covers the in-flight/pending case that failures don't).
let pending = 0
type Listener = (pending: number) => void
const listeners = new Set<Listener>()

export function increment() {
  pending += 1
  listeners.forEach((l) => l(pending))
}

export function decrement() {
  pending = Math.max(0, pending - 1)
  listeners.forEach((l) => l(pending))
}

export function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
