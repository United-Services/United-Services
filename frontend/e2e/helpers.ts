import { Page, expect } from "@playwright/test"

// Clerk's test-mode instances (pk_test_* keys, which this staging stack
// uses) treat any address of the form `name+clerk_test@domain` as a fixture
// address: email delivery is skipped and the fixed OTP `424242` always
// verifies it. This lets client/candidate signup run end-to-end without a
// real inbox. See https://clerk.com/docs/testing/test-emails-and-phones
export const CLERK_TEST_OTP = "424242"

export function uniqueClerkTestEmail(prefix: string): string {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  return `${prefix}+clerk_test_${stamp}@example.com`
}

/** Fill the 6 per-digit OTP boxes rendered by components/OtpInput.tsx. */
export async function fillOtp(page: Page, code: string) {
  const group = page.getByRole("group", { name: "Verification code" })
  await expect(group).toBeVisible()
  const firstDigit = group.getByLabel("Digit 1 of 6")
  await firstDigit.click()
  await page.keyboard.type(code)
}
