import { describe, expect, it } from "vitest"
import { Role } from "../enums/status.enums"
import { ADMIN_ROLES, isAdminRole } from "./adminRoles"

describe("ADMIN_ROLES / isAdminRole", () => {
  it("includes exactly Admin and SuperAdmin", () => {
    expect(ADMIN_ROLES).toEqual([Role.Admin, Role.SuperAdmin])
  })

  it.each([Role.Admin, Role.SuperAdmin])("treats %s as an admin role", (role) => {
    expect(isAdminRole(role)).toBe(true)
  })

  it.each([Role.Client, Role.Candidate])(
    "does not treat %s as an admin role",
    (role) => {
      expect(isAdminRole(role)).toBe(false)
    },
  )

  it("treats undefined/null/empty as not an admin role", () => {
    expect(isAdminRole(undefined)).toBe(false)
    expect(isAdminRole(null)).toBe(false)
    expect(isAdminRole("")).toBe(false)
  })

  it("is not fooled by an unrelated string that happens to contain 'admin'", () => {
    expect(isAdminRole("not-admin")).toBe(false)
    expect(isAdminRole("administrator")).toBe(false)
  })
})
