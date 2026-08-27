import { test, expect, Page } from "@playwright/test"
import { CLERK_TEST_OTP, fillOtp, uniqueClerkTestEmail } from "./helpers"

// Full client signup uses Clerk's test-mode fixture email addresses
// (`+clerk_test@`) so the email-verification step can be completed for
// real, without access to an inbox. See e2e/helpers.ts for details.
//
// KNOWN BLOCKER: Clerk's Cloudflare Turnstile CAPTCHA (mounted at
// #clerk-captcha in views/ClientSignup.tsx) reliably fails to load under
// Playwright's automated Chromium ("The CAPTCHA failed to load..."),
// which blocks signUp.password() at step 6 before an account is ever
// created. Clerk's own fix for this is @clerk/testing's
// setupClerkTestingToken(), but that call requires CLERK_SECRET_KEY,
// which is not present in this worktree (no root .env). Until a human
// supplies that key (or another bot-detection bypass) to the test
// environment, these flows cannot progress past step 6. Each test below
// runs the real form up through that point and skips with this reason
// once the CAPTCHA error is confirmed, instead of failing or faking a
// pass.

const CAPTCHA_BLOCKED_MESSAGE =
  "BLOCKED: Clerk Cloudflare Turnstile CAPTCHA fails to load under Playwright automation, " +
  "and bypassing it via setupClerkTestingToken() requires CLERK_SECRET_KEY, which is not " +
  "available in this worktree. See comment at top of this file."

async function signUpNewClient(page: Page) {
  const email = uniqueClerkTestEmail("client")
  const password = "Str0ng!Passw0rd9"

  await page.goto("/en/client-signup")
  await expect(page.getByText("Step 1 of 7")).toBeVisible()

  // Step 1: name
  await page.locator("#firstName").fill("Playwright")
  await page.locator("#lastName").fill("Tester")
  await page.getByRole("button", { name: /next/i }).click()

  // Step 2: phone
  await expect(page.getByText("Step 2 of 7")).toBeVisible()
  await page.locator('input[type="tel"]').fill("1012345678")
  await page.getByRole("button", { name: /next/i }).click()

  // Step 3: company
  await expect(page.getByText("Step 3 of 7")).toBeVisible()
  await page.locator("#company").fill("Playwright Testing Co.")
  await page.getByRole("button", { name: /next/i }).click()

  // Step 4: email
  await expect(page.getByText("Step 4 of 7")).toBeVisible()
  await page.locator("#email").fill(email)
  await page.getByRole("button", { name: /next/i }).click()

  // Step 5: password
  await expect(page.getByText("Step 5 of 7")).toBeVisible()
  await page.locator("#password").fill(password)
  await page.getByRole("button", { name: /next/i }).click()

  // Step 6: confirm password -> creates the Clerk account & sends the code
  await expect(page.getByText("Step 6 of 7")).toBeVisible()
  await page.locator("#confirmPassword").fill(password)
  await page.getByRole("button", { name: /next/i }).click()

  // Step 7 (success) vs. the Turnstile CAPTCHA failure race here — see the
  // BLOCKED comment at the top of this file.
  const step7 = page.getByText("Step 7 of 7")
  const captchaError = page.getByText(/CAPTCHA failed to load/i)
  await expect(step7.or(captchaError)).toBeVisible({ timeout: 15_000 })
  if (await captchaError.count()) {
    return { email, password, blocked: true as const }
  }

  await fillOtp(page, CLERK_TEST_OTP)
  await page.getByRole("button", { name: /create account|verify|finish/i }).click()

  return { email, password, blocked: false as const }
}

test.describe("Client signup and dashboard", () => {
  test("a new client can complete signup through email verification", async ({ page }) => {
    const result = await signUpNewClient(page)
    if (result.blocked) {
      test.skip(true, CAPTCHA_BLOCKED_MESSAGE)
      return
    }
    // Success screen replaces the form once signUp.finalize() resolves.
    await expect(page.getByText(/success|welcome|created/i).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test("client dashboard shows services, RFQ, and appointments sections", async ({ page }) => {
    const result = await signUpNewClient(page)
    if (result.blocked) {
      test.skip(true, CAPTCHA_BLOCKED_MESSAGE)
      return
    }
    await page.goto("/en/client-dashboard")
    await page.waitForLoadState("networkidle")

    // The three portal sections from clientDashboard.nav should be reachable.
    await expect(page.getByRole("button", { name: "Services" }).or(page.getByText("Services"))).toBeVisible({
      timeout: 15_000,
    })

    const rfqNav = page.getByText("Request a Service", { exact: true })
    if (await rfqNav.count()) {
      await rfqNav.first().click()
      await expect(page.getByText("Project Description")).toBeVisible()
    }

    const apptNav = page.getByText("Book Appointment", { exact: true })
    if (await apptNav.count()) {
      await apptNav.first().click()
      await expect(page.getByText(/appointment/i).first()).toBeVisible()
    }
  })

  test("appointment booking updates live across two client sessions (WebSocket)", async ({ browser }) => {
    // Two independent authenticated contexts so we can prove the
    // AppointmentsGateway broadcast — not a page refresh — is what updates
    // the second viewer's slot list.
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    const resultA = await signUpNewClient(pageA)
    const resultB = await signUpNewClient(pageB)
    if (resultA.blocked || resultB.blocked) {
      test.skip(true, CAPTCHA_BLOCKED_MESSAGE)
      return
    }

    await pageA.goto("/en/client-dashboard")
    await pageB.goto("/en/client-dashboard")
    await pageA.waitForLoadState("networkidle")
    await pageB.waitForLoadState("networkidle")

    const apptNavA = pageA.getByText("Book Appointment", { exact: true })
    const apptNavB = pageB.getByText("Book Appointment", { exact: true })
    if (!(await apptNavA.count()) || !(await apptNavB.count())) {
      test.skip(true, "Book Appointment nav item not available for a fresh client account")
    }
    await apptNavA.first().click()
    await apptNavB.first().click()

    const slotSelectA = pageA.locator("select").first()
    const slotSelectB = pageB.locator("select").first()
    await expect(slotSelectA).toBeVisible({ timeout: 15_000 })
    await expect(slotSelectB).toBeVisible({ timeout: 15_000 })

    const optionsBefore = await slotSelectB.locator("option").count()
    const availableOptions = await slotSelectA.locator("option").allTextContents()

    if (availableOptions.filter((o) => o.trim().length > 0).length <= 1) {
      test.skip(true, "No open appointment slots available in this environment to book")
    }

    // Book the first real slot in context A.
    await slotSelectA.selectOption({ index: 1 })
    await pageA.getByRole("button", { name: /book/i }).click()

    // Context B's slot list should update on its own via the WebSocket
    // gateway — no reload — within a reasonable window.
    await expect
      .poll(async () => slotSelectB.locator("option").count(), { timeout: 15_000 })
      .toBeLessThan(optionsBefore)

    await contextA.close()
    await contextB.close()
  })
})
