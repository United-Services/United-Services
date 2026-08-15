import { describe, expect, it, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"

let pathname = "/en/services"
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathname,
}))

const post = vi.fn()
vi.mock("@/lib/api", () => ({
  axios: { post: (...args: unknown[]) => post(...args) },
}))

import PageViewTracker from "./PageViewTracker"

describe("PageViewTracker", () => {
  beforeEach(() => {
    post.mockReset().mockResolvedValue({})
    pathname = "/en/services"
    sessionStorage.clear()
  })

  it("fires a page_view event on mount", () => {
    render(<PageViewTracker />)
    expect(post).toHaveBeenCalledWith("/analytics/track", {
      eventType: "page_view",
    })
  })

  it("fires again when the pathname changes", () => {
    const { rerender } = render(<PageViewTracker />)
    expect(post).toHaveBeenCalledTimes(1)

    pathname = "/en/careers"
    rerender(<PageViewTracker />)

    expect(post).toHaveBeenCalledTimes(2)
  })

  it("renders nothing", () => {
    const { container } = render(<PageViewTracker />)
    expect(container).toBeEmptyDOMElement()
  })

  it("does not re-fire for a duplicate mount on the same pathname within the dedupe window", () => {
    const { unmount } = render(<PageViewTracker />)
    expect(post).toHaveBeenCalledTimes(1)

    unmount()
    render(<PageViewTracker />)

    expect(post).toHaveBeenCalledTimes(1)
  })

  it("fires again for the same pathname once the dedupe window has passed", () => {
    vi.useFakeTimers()
    try {
      const { unmount } = render(<PageViewTracker />)
      expect(post).toHaveBeenCalledTimes(1)

      unmount()
      vi.advanceTimersByTime(3002)
      render(<PageViewTracker />)

      expect(post).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
