import { test, expect } from "@playwright/test"
import { CLERK_TEST_OTP, fillOtp, uniqueClerkTestEmail } from "./helpers"

// Same Clerk test-mode fixture-email pattern as client signup — see
// e2e/helpers.ts. Also subject to the same Cloudflare Turnstile CAPTCHA
// blocker documented at the top of client-signup-and-dashboard.spec.ts:
// the CAPTCHA reliably fails to load under Playwright automation, and
// bypassing it needs a CLERK_SECRET_KEY this worktree does not have.
const CAPTCHA_BLOCKED_MESSAGE =
  "BLOCKED: Clerk Cloudflare Turnstile CAPTCHA fails to load under Playwright automation, " +
  "and bypassing it via setupClerkTestingToken() requires CLERK_SECRET_KEY, which is not " +
  "available in this worktree."

test.describe("Candidate signup", () => {
  test("candidate signup page renders the application form", async ({ page }) => {
    await page.goto("/en/candidate-signup")
    await expect(page.locator("#candFirstName")).toBeVisible()
    await expect(page.locator("#candLastName")).toBeVisible()
    await expect(page.locator("#candDob")).toBeVisible()
    await expect(page.locator("#candEmail")).toBeVisible()
    await expect(page.locator("#candPassword")).toBeVisible()
  })

  test("a candidate can complete signup through email verification", async ({ page }) => {
    const email = uniqueClerkTestEmail("candidate")

    await page.goto("/en/candidate-signup")
    await page.locator("#candFirstName").fill("Playwright")
    await page.locator("#candLastName").fill("Candidate")
    await page.locator("#candDob").fill("1995-05-20")
    await page.locator("#candEmail").fill(email)
    await page.locator("#candPassword").fill("Str0ng!Passw0rd9")

    await page.getByRole("button", { name: /create account|submit|apply/i }).click()

    // Should transition into the verify sub-step (OTP input) — unless
    // Turnstile's CAPTCHA fails to load first, in which case account
    // creation never happens. See the BLOCKED comment above.
    const otpGroup = page.getByRole("group", { name: "Verification code" })
    const captchaError = page.getByText(/CAPTCHA failed to load/i)
    await expect(otpGroup.or(captchaError)).toBeVisible({ timeout: 15_000 })
    if (await captchaError.count()) {
      test.skip(true, CAPTCHA_BLOCKED_MESSAGE)
      return
    }
    await fillOtp(page, CLERK_TEST_OTP)
    await page.getByRole("button", { name: /verify|confirm|continue/i }).click()

    // Either a success state renders in place, or the app navigates away
    // (e.g. to the candidate dashboard) once signUp.finalize() resolves.
    await expect
      .poll(
        async () => {
          const url = page.url()
          const bodyText = (await page.textContent("body")) ?? ""
          const navigatedAway = !url.includes("/candidate-signup")
          const showsSuccess = /success|welcome|submitted|thank you/i.test(bodyText)
          return navigatedAway || showsSuccess
        },
        { timeout: 15_000 }
      )
      .toBe(true)
  })
})
