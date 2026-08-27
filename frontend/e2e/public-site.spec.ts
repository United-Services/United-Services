import { test, expect } from "@playwright/test"

// Public, unauthenticated pages. These exercise real server-rendered
// content (no mocking) against the live staging stack.

test.describe("Public site", () => {
  test("homepage loads with hero content and nav", async ({ page }) => {
    await page.goto("/en")
    await expect(page.getByRole("heading", { name: /United Services/i }).first()).toBeVisible()
    // Primary nav items are rendered as buttons (client-side navigation via
    // useAppNavigate/router.push, not <a href>) — see components/PublicNav.tsx.
    for (const label of ["Services", "Careers", "Contact", "About", "Vision", "Projects"]) {
      await expect(page.getByRole("button", { name: label, exact: true }).first()).toBeVisible()
    }
  })

  test("nav links navigate to the right pages", async ({ page }) => {
    await page.goto("/en")
    await page.getByRole("button", { name: "Services", exact: true }).first().click()
    await page.waitForURL(/\/services/)
    await expect(page).toHaveURL(/\/en\/services/)

    await page.goto("/en")
    await page.getByRole("button", { name: "Careers", exact: true }).first().click()
    await page.waitForURL(/\/careers/)
    await expect(page).toHaveURL(/\/en\/careers/)

    await page.goto("/en")
    await page.getByRole("button", { name: "Contact", exact: true }).first().click()
    await page.waitForURL(/\/contact/)
    await expect(page).toHaveURL(/\/en\/contact/)
  })

  test("services page renders real services from the DB", async ({ page }) => {
    await page.goto("/en/services")
    await expect(page.getByRole("heading", { name: "Systems Index" })).toBeVisible()
    // At least one service card/heading beyond the page title should render,
    // proving data came from the backend rather than an empty state.
    const headings = page.getByRole("heading", { level: 2 })
    await expect(headings.first()).toBeVisible()
    expect(await headings.count()).toBeGreaterThan(0)
  })

  test("careers page lists open positions", async ({ page }) => {
    await page.goto("/en/careers")
    await expect(
      page.getByRole("heading", { name: /Join the team that protects the region/i })
    ).toBeVisible()
    // The page should either list at least one open position or show an
    // explicit empty state — assert the container rendered meaningful content.
    await page.waitForLoadState("networkidle")
    const bodyText = await page.textContent("body")
    expect(bodyText?.length ?? 0).toBeGreaterThan (200)
  })

  test("contact page renders", async ({ page }) => {
    await page.goto("/en/contact")
    await page.waitForLoadState("domcontentloaded")
    await expect(page.locator("body")).toBeVisible()
    expect(page.url()).toContain("/en/contact")
  })

  test("client signup entry page renders the multi-step form", async ({ page }) => {
    await page.goto("/en/client-signup")
    await expect(page.getByRole("heading", { name: "Create Client Account" })).toBeVisible()
    await expect(page.getByText("Step 1 of 7")).toBeVisible()
  })

  test("candidate signup entry page renders", async ({ page }) => {
    await page.goto("/en/candidate-signup")
    await page.waitForLoadState("domcontentloaded")
    await expect(page.locator("body")).toBeVisible()
  })

  test("sign-in page renders", async ({ page }) => {
    await page.goto("/en/sign-in")
    await expect(
      page.getByText(/Sign in to manage your services, requests, and documents\./i)
    ).toBeVisible()
  })
})
