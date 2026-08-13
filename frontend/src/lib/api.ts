import axiosLib from "axios"

// Every backend call goes through this instance — no raw fetch. In the
// browser, withCredentials carries the Clerk session cookie once the
// frontend and API share a domain in production; until then (and always
// for Server Components, which have no browser cookie jar to rely on),
// callers attach a bearer token explicitly via authHeader() below.
export const axios = axiosLib.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1",
  withCredentials: true,
})

export function authHeader(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}
