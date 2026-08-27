import { test, expect } from "@playwright/test"

// Admin sign-in requires password + TOTP MFA. This suite can only cover the
// pre-auth surface (sign-in page, the MFA challenge page's own rendering)
// because generating a valid TOTP code requires the admin's decrypted TOTP
// secret (KEK-encrypted at rest) — access this e2e run does not have. Full
// admin-dashboard coverage is a documented blocker; see the PR description.

test.describe("Admin flow (pre-auth surface only — full login blocked on TOTP MFA)", () => {
  test("sign-in page renders with the unified login form", async ({ page }) => {
    await page.goto("/en/sign-in")
    await expect(
      page.getByText(/Sign in to manage your services, requests, and documents\./i)
    ).toBeVisible()
    // Clerk's own sign-in widget mounts into the page.
    await page.waitForLoadState("networkidle")
    const emailField = page.locator('input[type="email"], input[name="identifier"]').first()
    await expect(emailField).toBeVisible({ timeout: 15_000 })
  })

  test("MFA challenge page renders its own UI when navigated to directly", async ({ page }) => {
    await page.goto("/en/admin-mfa-challenge")
    // Unauthenticated visitors may get redirected to sign-in instead of
    // seeing the challenge UI directly — assert whichever is true rather
    // than assuming one.
    await page.waitForLoadState("networkidle")
    const onChallenge = page.url().includes("admin-mfa-challenge")
    if (onChallenge) {
      await expect(page.getByText("Verify Your Identity")).toBeVisible()
      await expect(page.getByText(/Enter the 6-digit code from your app/i)).toBeVisible()
    } else {
      await expect(page).toHaveURL(/sign-in/)
    }
  })

  test.skip(
    true,
    "BLOCKED: full admin login requires a valid TOTP code generated from the " +
      "admin test account's decrypted secret (KEK-protected at rest via " +
      "otplib in backend/). This e2e run has no DB/KEK access to derive one. " +
      "A human needs to either expose a way to mint valid TOTP codes for a " +
      "test admin account, or run this portion of the suite interactively."
  )
})
