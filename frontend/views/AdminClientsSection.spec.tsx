import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: async () => "fake-token" }),
}))
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key
    // AdminClientsSection uses t.raw("clients.cols") for the table's
    // column-header labels array — next-intl's real t() exposes this too.
    t.raw = (key: string) =>
      key === "clients.cols"
        ? [
            "Name",
            "Company",
            "Email",
            "Role",
            "Created",
            "MFA",
            "Status",
            "Actions",
          ]
        : key
    // adminShared.tsx's StatusBadge calls t.has(...) to decide whether to
    // fall back to a raw status string — real next-intl exposes this too.
    t.has = () => false
    return t
  },
}))

const get = vi.fn()
vi.mock("../lib/api", () => ({
  axios: { get: (...args: unknown[]) => get(...args) },
  authHeader: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
}))

import AdminClientsSection from "./AdminClientsSection"

const rows = [
  {
    id: "user-admin-1",
    firstName: "Reg",
    lastName: "Admin",
    email: "reg-admin@example.com",
    companyName: null,
    role: "admin",
    createdAt: new Date().toISOString(),
    disabledAt: null,
    mfaEnrolled: true,
    mustChangePassword: false,
  },
  {
    id: "user-super-1",
    firstName: "Super",
    lastName: "Admin",
    email: "super@example.com",
    companyName: null,
    role: "super_admin",
    createdAt: new Date().toISOString(),
    disabledAt: null,
    mfaEnrolled: true,
    mustChangePassword: false,
  },
]

describe("AdminClientsSection — super_admin role option and target-protection UI", () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue({ data: { items: rows, hasMore: false } })
  })

  it("does not offer 'Super Admin' as a role-filter option for a plain admin viewer", async () => {
    render(<AdminClientsSection setError={vi.fn()} isSuperAdmin={false} />)
    await screen.findByText("reg-admin@example.com")

    // Scoped to the filter dropdown specifically — a super_admin *row's*
    // own select legitimately still renders the option (disabled, so the
    // control still displays that row's real current value); that's
    // covered by the next test. This one only checks the two places a
    // plain admin could otherwise use it to grant the role: the filter
    // and the create-user form.
    const filterSelect = screen
      .getAllByRole("combobox")
      .find((el) => within(el).queryByText("clients.allRoles"))!
    expect(
      within(filterSelect).queryByText("clients.roleSuperAdmin"),
    ).not.toBeInTheDocument()

    screen.getByText("clients.addUser").click()
    const createFormSelect = screen
      .getAllByRole("combobox")
      .find((el) => within(el).queryByText("clients.roleClient"))!
    expect(
      within(createFormSelect).queryByText("clients.roleSuperAdmin"),
    ).not.toBeInTheDocument()
  })

  it("disables the role select and action buttons on an existing super_admin row for a plain admin viewer", async () => {
    render(<AdminClientsSection setError={vi.fn()} isSuperAdmin={false} />)
    const superAdminRow = (await screen.findByText("super@example.com")).closest("tr")!

    const roleSelect = within(superAdminRow).getByRole("combobox")
    expect(roleSelect).toBeDisabled()
    // The select must still render a Super Admin option matching the
    // row's actual current value even though the viewer can't grant it —
    // otherwise the select would silently show nothing selected.
    expect(
      within(roleSelect).getByRole("option", { name: "clients.roleSuperAdmin" }),
    ).toBeInTheDocument()

    for (const label of ["clients.resetPassword", "clients.disable"]) {
      expect(within(superAdminRow).getByText(label).closest("button")).toBeDisabled()
    }
  })

  it("leaves the plain-admin row's controls fully enabled for a plain admin viewer (only super_admin targets are protected)", async () => {
    render(<AdminClientsSection setError={vi.fn()} isSuperAdmin={false} />)
    const adminRow = (await screen.findByText("reg-admin@example.com")).closest("tr")!

    expect(within(adminRow).getByRole("combobox")).not.toBeDisabled()
    expect(
      within(adminRow).getByText("clients.resetPassword").closest("button"),
    ).not.toBeDisabled()
  })

  it("offers 'Super Admin' as a role option and enables every row's controls for a super_admin viewer", async () => {
    render(<AdminClientsSection setError={vi.fn()} isSuperAdmin={true} />)
    const superAdminRow = (await screen.findByText("super@example.com")).closest("tr")!

    expect(within(superAdminRow).getByRole("combobox")).not.toBeDisabled()
    expect(
      within(superAdminRow).getByText("clients.resetPassword").closest("button"),
    ).not.toBeDisabled()

    // The role-filter dropdown (not scoped to a row) also gets the option.
    const filterSelects = screen.getAllByRole("combobox")
    const filterSelect = filterSelects.find((el) =>
      within(el).queryByText("clients.allRoles"),
    )!
    expect(
      within(filterSelect).getByRole("option", { name: "clients.roleSuperAdmin" }),
    ).toBeInTheDocument()
  })
})
