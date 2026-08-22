"use client"

import { useState } from "react"
import { useRequestGuard } from "./useRequestGuard"

// Backend admin list endpoints (RFQs, appointments, file-access requests,
// candidate applications, admin users, audit log) all return this shape —
// see backend/src/common/utils/paginate.ts.
export interface Page<T> {
  items: T[]
  hasMore: boolean
}

type FetchPage<T> = (skip: number, take: number) => Promise<Page<T>>

// Shared "load 20, Load More for 20 more" state for the admin dashboard's
// paginated lists — replaces the old pattern of fetching an endpoint's
// entire (backend-capped) result set in one call.
//
// `fetchPage` is passed in at call time (not fixed once at hook creation)
// so a caller can pass query/filter values straight through — several of
// this dashboard's filter dropdowns call load*(query, newFilterValue) with
// a value that hasn't landed in state yet when the call is made (state
// updates are async), so a fetchPage closed over component state at hook-
// creation time would read the stale value.
export function usePaginatedList<T>(onError: (err: unknown) => void, pageSize = 20) {
  const [items, setItems] = useState<T[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Only ever flips true -> false, on the very first reload() to settle —
  // a skeleton placeholder for the initial fetch, not something that
  // re-triggers on every filter change (the list just updates in place
  // after that, same as before this flag existed).
  const [initialLoading, setInitialLoading] = useState(true)
  const guard = useRequestGuard()

  // Replaces the list from the start — call on mount and whenever a
  // filter/search query changes, same as the old loadX() functions did.
  const reload = async (fetchPage: FetchPage<T>) => {
    const reqId = guard.start()
    try {
      const page = await fetchPage(0, pageSize)
      if (guard.stale(reqId)) return
      setItems(page.items)
      setHasMore(page.hasMore)
    } catch (err) {
      if (guard.stale(reqId)) return
      onError(err)
    } finally {
      if (!guard.stale(reqId)) setInitialLoading(false)
    }
  }

  // Appends the next page rather than replacing — the Load More button's
  // handler. Takes the same fetchPage as the current reload() so it keeps
  // whatever filters are active.
  const loadMore = async (fetchPage: FetchPage<T>) => {
    setLoadingMore(true)
    try {
      const page = await fetchPage(items.length, pageSize)
      setItems((prev) => [...prev, ...page.items])
      setHasMore(page.hasMore)
    } catch (err) {
      onError(err)
    } finally {
      setLoadingMore(false)
    }
  }

  return { items, setItems, hasMore, loadingMore, initialLoading, reload, loadMore }
}
