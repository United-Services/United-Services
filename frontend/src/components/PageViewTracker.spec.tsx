import { describe, expect, it, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"

let pathname = "/en/services"
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathname,
}))

const post = vi.fn()
vi.mock("@/lib/api", () => ({
  api: { post: (...args: unknown[]) => post(...args) },
}))

import PageViewTracker from "./PageViewTracker"

describe("PageViewTracker", () => {
  beforeEach(() => {
    post.mockReset().mockResolvedValue({})
    pathname = "/en/services"
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
})
