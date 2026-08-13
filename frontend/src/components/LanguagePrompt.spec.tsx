import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const replace = vi.fn()
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/en/services",
  useRouter: () => ({ replace }),
}))

const get = vi.fn()
vi.mock("@/lib/api", () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}))

import LanguagePrompt from "./LanguagePrompt"

const DISMISSED_KEY = "use_lang_prompt_dismissed"

// The default-English + ask-before-switching behavior is a deliberate
// product requirement (never auto-redirect on geo IP). These tests lock in
// that the banner only appears for a genuinely different detected locale,
// never switches without a click, and remembers a "no" so it doesn't nag.
describe("LanguagePrompt", () => {
  beforeEach(() => {
    replace.mockClear()
    get.mockReset()
    window.localStorage.clear()
  })

  it("stays hidden when the detected locale is English", async () => {
    get.mockResolvedValue({ data: { locale: "en" } })
    render(<LanguagePrompt />)
    await waitFor(() => expect(get).toHaveBeenCalledWith("/geo/locale"))
    expect(screen.queryByText(/يبدو أنك/)).not.toBeInTheDocument()
  })

  it('shows the Arabic prompt when geo-detection returns "ar"', async () => {
    get.mockResolvedValue({ data: { locale: "ar" } })
    render(<LanguagePrompt />)
    expect(await screen.findByText(/يبدو أنك/)).toBeInTheDocument()
  })

  it("switches locale and remembers the choice on confirm", async () => {
    get.mockResolvedValue({ data: { locale: "zh" } })
    render(<LanguagePrompt />)
    const switchButton = await screen.findByText("切换到中文")

    await userEvent.click(switchButton)

    expect(replace).toHaveBeenCalledWith("/en/services", { locale: "zh" })
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe("1")
  })

  it("dismisses without switching and remembers the dismissal", async () => {
    get.mockResolvedValue({ data: { locale: "ar" } })
    render(<LanguagePrompt />)
    const dismissButton = await screen.findByText("المتابعة بالإنجليزية")

    await userEvent.click(dismissButton)

    expect(replace).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe("1")
    expect(screen.queryByText("المتابعة بالإنجليزية")).not.toBeInTheDocument()
  })

  it("never calls the geo endpoint once already dismissed", () => {
    window.localStorage.setItem(DISMISSED_KEY, "1")
    render(<LanguagePrompt />)
    expect(get).not.toHaveBeenCalled()
  })
})
