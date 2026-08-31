import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: async () => "fake-token" }),
}))
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))
vi.mock("../components/WorldMap", () => ({
  default: () => <div data-testid="world-map" />,
}))

const get = vi.fn()
vi.mock("../lib/api", () => ({
  axios: { get: (...args: unknown[]) => get(...args) },
  authHeader: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
}))

import AdminOverviewSection from "./AdminOverviewSection"

const OVERVIEW = {
  clientCount: 3,
  companyCount: 2,
  fileAccessRequested: 1,
  fileAccessApproved: 1,
  rfqCount: 4,
  appointmentCount: 5,
  candidatesByStatus: [],
  ctaClicks: [],
  serviceViews: [],
}

describe("AdminOverviewSection — audit-log-backed Recent Activity card is super_admin only", () => {
  beforeEach(() => {
    get.mockReset().mockImplementation((url: string) => {
      if (url === "/analytics/overview") return Promise.resolve({ data: OVERVIEW })
      if (url === "/analytics/geo-overview")
        return Promise.resolve({ data: { countries: [] } })
      if (url === "/audit-log")
        return Promise.resolve({
          data: {
            items: [
              {
                id: "log-1",
                action: "user.disabled",
                targetType: "User",
                targetId: "u1",
                createdAt: new Date().toISOString(),
                actor: {
                  firstName: "A",
                  lastName: "B",
                  email: "a@b.com",
                  role: "super_admin",
                },
              },
            ],
          },
        })
      return Promise.reject(new Error(`unexpected url ${url}`))
    })
  })

  it("never calls GET /audit-log for a plain admin — that endpoint is super_admin-only on the backend", async () => {
    render(
      <AdminOverviewSection setError={vi.fn()} isSuperAdmin={false} onViewAuditLog={undefined} />,
    )

    await waitFor(() => expect(get).toHaveBeenCalledWith("/analytics/overview", expect.anything()))

    expect(get).not.toHaveBeenCalledWith(
      "/audit-log",
      expect.anything(),
    )
  })

  it("does not render the Recent Activity card for a plain admin", async () => {
    render(
      <AdminOverviewSection setError={vi.fn()} isSuperAdmin={false} onViewAuditLog={undefined} />,
    )

    await waitFor(() =>
      expect(screen.getByText("overview.clients")).toBeInTheDocument(),
    )
    expect(screen.queryByText("overview.recentActivity")).not.toBeInTheDocument()
  })

  it("calls GET /audit-log and renders the Recent Activity card for a super_admin", async () => {
    const onViewAuditLog = vi.fn()
    render(
      <AdminOverviewSection
        setError={vi.fn()}
        isSuperAdmin={true}
        onViewAuditLog={onViewAuditLog}
      />,
    )

    await waitFor(() => expect(get).toHaveBeenCalledWith("/audit-log", expect.anything()))
    expect(await screen.findByText("overview.recentActivity")).toBeInTheDocument()
  })

  it("wires the view-full-log button to the provided callback for a super_admin", async () => {
    const onViewAuditLog = vi.fn()
    render(
      <AdminOverviewSection
        setError={vi.fn()}
        isSuperAdmin={true}
        onViewAuditLog={onViewAuditLog}
      />,
    )

    const button = await screen.findByText("overview.viewFullLog")
    button.click()
    expect(onViewAuditLog).toHaveBeenCalledTimes(1)
  })

  // Regression: AuditLog.actorUserId is nullable on the backend (system-
  // generated entries, or the actor's account was later deleted) — a
  // null actor here used to crash the whole admin dashboard with
  // "Cannot read properties of null (reading 'firstName')" instead of
  // just rendering that one row as "System".
  it("renders a system-generated entry (null actor) as System instead of crashing", async () => {
    get.mockReset().mockImplementation((url: string) => {
      if (url === "/analytics/overview") return Promise.resolve({ data: OVERVIEW })
      if (url === "/analytics/geo-overview")
        return Promise.resolve({ data: { countries: [] } })
      if (url === "/audit-log")
        return Promise.resolve({
          data: {
            items: [
              {
                id: "log-1",
                action: "db_mirror.sync",
                targetType: "System",
                targetId: "sys",
                createdAt: new Date().toISOString(),
                actor: null,
              },
            ],
          },
        })
      return Promise.reject(new Error(`unexpected url ${url}`))
    })

    render(
      <AdminOverviewSection setError={vi.fn()} isSuperAdmin={true} onViewAuditLog={vi.fn()} />,
    )

    expect(await screen.findByText("overview.systemActor")).toBeInTheDocument()
  })
})
