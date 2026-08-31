"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { InlineSpinner } from "../components/Spinner"
import { IconCheck, IconCopy } from "../components/NavIcons"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { usePaginatedList } from "../lib/usePaginatedList"
import { Role } from "../enums/status.enums"
import { fmtDate, StatusBadge, tableHead, TableSkeletonRows, LoadMoreButton, SearchBox } from "./adminShared"

interface AdminUser {
  id: string
  firstName: string
  lastName: string
  email: string
  companyName: string | null
  role: string
  createdAt: string
  disabledAt: string | null
  mfaEnrolled: boolean
  mustChangePassword: boolean
}

interface Props {
  setError: (message: string | null) => void
  // Gates the "Super Admin" role option in both selects below — the
  // backend rejects a plain admin granting/touching that role regardless
  // (see AdminUsersController.assertCanGrantRole/assertCanActOnTarget),
  // this just keeps the option from being offered somewhere it would only
  // ever be rejected.
  isSuperAdmin: boolean
}

export default function AdminClientsSection({ setError, isSuperAdmin }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminDashboard")
  const tCommon = useTranslations("common")
  const authed = async () => authHeader(await getToken())

  const onListError = (err: unknown) =>
    setError(getErrorMessage(err, tCommon("errors.loadFailed")))
  const clientsList = usePaginatedList<AdminUser>(onListError)

  const [clientQuery, setClientQuery] = useState("")
  const [clientRoleFilter, setClientRoleFilter] = useState("")
  const [showCreateUserForm, setShowCreateUserForm] = useState(false)
  const [newUserForm, setNewUserForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: Role.Client,
    companyName: "",
    phone: "",
  })
  const [creatingUser, setCreatingUser] = useState(false)
  const [tempPasswordResult, setTempPasswordResult] = useState<{
    email: string
    tempPassword: string
  } | null>(null)
  const [passwordCopied, setPasswordCopied] = useState(false)

  const clientsFetchPage =
    (q: string, role: string) => async (skip: number, take: number) => {
      const headers = await authed()
      const { data } = await axios.get("/admin/users", {
        headers,
        params: { role: role || undefined, q: q || undefined, skip, take },
      })
      return data
    }
  const loadClients = (q = "", role = clientRoleFilter) =>
    clientsList.reload(clientsFetchPage(q, role))
  const loadMoreClients = () =>
    clientsList.loadMore(clientsFetchPage(clientQuery, clientRoleFilter))

  useEffect(() => {
    loadClients()
  }, [])

  const toggleClientStatus = async (c: AdminUser) => {
    try {
      const headers = await authed()
      await axios.patch(
        `/admin/users/${c.id}/${c.disabledAt ? "enable" : "disable"}`,
        {},
        { headers },
      )
      loadClients(clientQuery)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUserForm.email || !newUserForm.firstName || !newUserForm.lastName)
      return
    setCreatingUser(true)
    try {
      const headers = await authed()
      const { data } = await axios.post(
        "/admin/users",
        {
          email: newUserForm.email,
          firstName: newUserForm.firstName,
          lastName: newUserForm.lastName,
          role: newUserForm.role,
          companyName: newUserForm.companyName || undefined,
          phone: newUserForm.phone || undefined,
        },
        { headers },
      )
      setTempPasswordResult({
        email: newUserForm.email,
        tempPassword: data.tempPassword,
      })
      setPasswordCopied(false)
      setNewUserForm({
        email: "",
        firstName: "",
        lastName: "",
        role: Role.Client,
        companyName: "",
        phone: "",
      })
      setShowCreateUserForm(false)
      loadClients(clientQuery)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setCreatingUser(false)
    }
  }

  const changeUserRole = async (u: AdminUser, role: string) => {
    if (role === u.role) return
    try {
      const headers = await authed()
      await axios.patch(`/admin/users/${u.id}/role`, { role }, { headers })
      loadClients(clientQuery)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  const resetUserPassword = async (u: AdminUser) => {
    try {
      const headers = await authed()
      const { data } = await axios.post(
        `/admin/users/${u.id}/reset-password`,
        {},
        { headers },
      )
      setTempPasswordResult({ email: u.email, tempPassword: data.tempPassword })
      setPasswordCopied(false)
      loadClients(clientQuery)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  return (
    <>
      {tempPasswordResult && (
        <div
          style={{
            background: palette.accentLight,
            border: `1.5px solid ${palette.accent}`,
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: palette.navy,
              marginBottom: 6,
            }}
          >
            {t("clients.tempPasswordHeading", {
              email: tempPasswordResult.email,
            })}
          </div>
          <div
            style={{
              fontSize: 12,
              color: palette.muted,
              marginBottom: 12,
            }}
          >
            {t("clients.tempPasswordSub")}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <code
              style={{
                background: "#fff",
                border: "1px solid #E6E5E0",
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 14,
                fontWeight: 700,
                color: palette.navy,
                letterSpacing: "0.02em",
              }}
            >
              {tempPasswordResult.tempPassword}
            </code>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(
                  tempPasswordResult.tempPassword,
                )
                setPasswordCopied(true)
                setTimeout(() => setPasswordCopied(false), 2000)
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: passwordCopied ? palette.accentLight : "#F3F2EE",
                color: passwordCopied ? "#166534" : palette.slate,
                border: passwordCopied ? "1px solid #16A34A" : "1px solid transparent",
                borderRadius: 9999,
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
                transition: "background 0.15s, color 0.15s, border-color 0.15s",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  transform: passwordCopied ? "scale(1)" : "scale(0.6)",
                  opacity: passwordCopied ? 1 : 0,
                  width: passwordCopied ? "auto" : 0,
                  transition: "transform 0.2s ease, opacity 0.2s ease",
                }}
              >
                <IconCheck size={13} />
              </span>
              {!passwordCopied && <IconCopy size={13} />}
              {passwordCopied ? t("clients.copied") : t("clients.copy")}
            </button>
            <button
              onClick={() => setTempPasswordResult(null)}
              style={{
                background: "none",
                border: "none",
                color: palette.muted,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
                marginLeft: "auto",
              }}
            >
              {t("clients.dismiss")}
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <SearchBox
          value={clientQuery}
          onChange={setClientQuery}
          onSearch={() => loadClients(clientQuery)}
          placeholder={t("clients.searchPlaceholder")}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <select
            value={clientRoleFilter}
            onChange={(e) => {
              setClientRoleFilter(e.target.value)
              loadClients(clientQuery, e.target.value)
            }}
            style={{
              padding: "9px 14px",
              borderRadius: 9999,
              border: "1.5px solid #E6E5E0",
              fontSize: 13,
              fontFamily: "Poppins, sans-serif",
              color: palette.slate,
            }}
          >
            <option value="">{t("clients.allRoles")}</option>
            <option value={Role.Client}>{t("clients.roleClient")}</option>
            <option value={Role.Candidate}>
              {t("clients.roleCandidate")}
            </option>
            <option value={Role.Admin}>{t("clients.roleAdmin")}</option>
            {isSuperAdmin && (
              <option value={Role.SuperAdmin}>
                {t("clients.roleSuperAdmin")}
              </option>
            )}
          </select>
          <button
            onClick={() => setShowCreateUserForm((v) => !v)}
            style={{
              padding: "9px 18px",
              borderRadius: 9999,
              border: "none",
              background: palette.accent,
              color: palette.navy,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "Poppins, sans-serif",
            }}
          >
            {t("clients.addUser")}
          </button>
        </div>
      </div>

      {showCreateUserForm && (
        <form
          onSubmit={createUser}
          style={{
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #E6E5E0",
            padding: 20,
            marginBottom: 20,
            display: "flex",
            gap: 12,
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: palette.navy,
                marginBottom: 6,
              }}
            >
              {t("clients.firstName")}
            </label>
            <input
              value={newUserForm.firstName}
              onChange={(e) =>
                setNewUserForm((f) => ({
                  ...f,
                  firstName: e.target.value,
                }))
              }
              placeholder={t("clients.firstNamePlaceholder")}
              required
              style={{
                padding: "9px 12px",
                borderRadius: 10,
                border: "1.5px solid #E6E5E0",
                fontSize: 13,
                fontFamily: "Poppins, sans-serif",
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: palette.navy,
                marginBottom: 6,
              }}
            >
              {t("clients.lastName")}
            </label>
            <input
              value={newUserForm.lastName}
              onChange={(e) =>
                setNewUserForm((f) => ({
                  ...f,
                  lastName: e.target.value,
                }))
              }
              placeholder={t("clients.lastNamePlaceholder")}
              required
              style={{
                padding: "9px 12px",
                borderRadius: 10,
                border: "1.5px solid #E6E5E0",
                fontSize: 13,
                fontFamily: "Poppins, sans-serif",
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: palette.navy,
                marginBottom: 6,
              }}
            >
              {t("clients.email")}
            </label>
            <input
              type="email"
              value={newUserForm.email}
              onChange={(e) =>
                setNewUserForm((f) => ({ ...f, email: e.target.value }))
              }
              placeholder={t("clients.emailPlaceholder")}
              required
              style={{
                padding: "9px 12px",
                borderRadius: 10,
                border: "1.5px solid #E6E5E0",
                fontSize: 13,
                fontFamily: "Poppins, sans-serif",
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: palette.navy,
                marginBottom: 6,
              }}
            >
              {t("clients.companyName")}
            </label>
            <input
              value={newUserForm.companyName}
              onChange={(e) =>
                setNewUserForm((f) => ({
                  ...f,
                  companyName: e.target.value,
                }))
              }
              placeholder={t("clients.companyNamePlaceholder")}
              style={{
                padding: "9px 12px",
                borderRadius: 10,
                border: "1.5px solid #E6E5E0",
                fontSize: 13,
                fontFamily: "Poppins, sans-serif",
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: palette.navy,
                marginBottom: 6,
              }}
            >
              {t("clients.role")}
            </label>
            <select
              value={newUserForm.role}
              onChange={(e) =>
                setNewUserForm((f) => ({ ...f, role: e.target.value as Role }))
              }
              style={{
                padding: "9px 12px",
                borderRadius: 10,
                border: "1.5px solid #E6E5E0",
                fontSize: 13,
                fontFamily: "Poppins, sans-serif",
              }}
            >
              <option value={Role.Client}>{t("clients.roleClient")}</option>
              <option value={Role.Candidate}>
                {t("clients.roleCandidate")}
              </option>
              <option value={Role.Admin}>{t("clients.roleAdmin")}</option>
              {isSuperAdmin && (
                <option value={Role.SuperAdmin}>
                  {t("clients.roleSuperAdmin")}
                </option>
              )}
            </select>
          </div>
          <button
            type="submit"
            disabled={creatingUser}
            style={{
              padding: "10px 22px",
              borderRadius: 9999,
              border: "none",
              background: palette.accent,
              color: palette.navy,
              fontWeight: 700,
              fontSize: 13,
              cursor: creatingUser ? "default" : "pointer",
              fontFamily: "Poppins, sans-serif",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {creatingUser && <InlineSpinner size={13} />}
            {t("clients.createAccount")}
          </button>
        </form>
      )}

      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #E6E5E0",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          {tableHead(t.raw("clients.cols"))}
          {clientsList.initialLoading ? (
            <TableSkeletonRows cols={t.raw("clients.cols").length} />
          ) : (
          <tbody>
            {clientsList.items.map((c, i) => (
              <tr
                key={c.id}
                style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}
              >
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 13,
                    color: palette.navy,
                    fontWeight: 600,
                  }}
                >
                  {c.firstName} {c.lastName}
                  {c.mustChangePassword && (
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: palette.navy,
                        marginTop: 2,
                      }}
                    >
                      {t("clients.pendingPasswordChange")}
                    </div>
                  )}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 13,
                    color: palette.slate,
                  }}
                >
                  {c.companyName ?? "—"}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 12,
                    color: palette.muted,
                  }}
                >
                  {c.email}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <select
                    value={c.role}
                    onChange={(e) => changeUserRole(c, e.target.value)}
                    // Mirrors AdminUsersController.assertCanActOnTarget:
                    // only a super_admin can modify another super_admin's
                    // account, so a plain admin gets a disabled (but
                    // still legible) select on that row rather than a
                    // control that would only ever 403 on change.
                    disabled={!isSuperAdmin && c.role === Role.SuperAdmin}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1.5px solid #E6E5E0",
                      fontSize: 12,
                      fontFamily: "Poppins, sans-serif",
                      color: palette.slate,
                    }}
                  >
                    <option value={Role.Client}>
                      {t("clients.roleClient")}
                    </option>
                    <option value={Role.Candidate}>
                      {t("clients.roleCandidate")}
                    </option>
                    <option value={Role.Admin}>
                      {t("clients.roleAdmin")}
                    </option>
                    {(isSuperAdmin || c.role === Role.SuperAdmin) && (
                      <option value={Role.SuperAdmin}>
                        {t("clients.roleSuperAdmin")}
                      </option>
                    )}
                  </select>
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 12,
                    color: palette.muted,
                  }}
                >
                  {fmtDate(c.createdAt)}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 12,
                    color: palette.muted,
                  }}
                >
                  {c.mfaEnrolled ? t("yes") : t("no")}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <StatusBadge
                    status={c.disabledAt ? "disabled" : "active"}
                  />
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => resetUserPassword(c)}
                      // Mirrors AdminUsersController.assertCanActOnTarget
                      // — see the role select's comment above.
                      disabled={!isSuperAdmin && c.role === Role.SuperAdmin}
                      style={{
                        background: "#F3F2EE",
                        color: palette.slate,
                        border: "none",
                        borderRadius: 9999,
                        padding: "5px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor:
                          !isSuperAdmin && c.role === Role.SuperAdmin
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          !isSuperAdmin && c.role === Role.SuperAdmin
                            ? 0.5
                            : 1,
                        fontFamily: "Poppins, sans-serif",
                      }}
                    >
                      {t("clients.resetPassword")}
                    </button>
                    <button
                      onClick={() => toggleClientStatus(c)}
                      disabled={!isSuperAdmin && c.role === Role.SuperAdmin}
                      style={{
                        background: c.disabledAt
                          ? "#166534"
                          : "#991B1B",
                        color: "#fff",
                        border: "none",
                        borderRadius: 9999,
                        padding: "5px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor:
                          !isSuperAdmin && c.role === Role.SuperAdmin
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          !isSuperAdmin && c.role === Role.SuperAdmin
                            ? 0.5
                            : 1,
                        fontFamily: "Poppins, sans-serif",
                      }}
                    >
                      {c.disabledAt
                        ? t("clients.enable")
                        : t("clients.disable")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {clientsList.items.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    fontSize: 13,
                    color: palette.muted,
                  }}
                >
                  {t("clients.none")}
                </td>
              </tr>
            )}
          </tbody>
          )}
        </table>
        <LoadMoreButton
          hasMore={clientsList.hasMore}
          loading={clientsList.loadingMore}
          onClick={loadMoreClients}
        />
      </div>
    </>
  )
}
