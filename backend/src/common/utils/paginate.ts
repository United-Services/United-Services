// Shared shape for every in-app fuzzy-matched admin list endpoint (see
// SEARCH_SCAN_LIMIT): the DB query is already bounded, fuzzy-matching then
// runs over that bounded set, and this applies the final page slice —
// mirrors audit-log.service.ts's original skip/take-over-filtered-rows
// pattern, now shared instead of duplicated per controller.
export const DEFAULT_PAGE_SIZE = 20;

export interface Page<T> {
  items: T[];
  hasMore: boolean;
}

export function paginate<T>(
  filtered: T[],
  skip: number,
  take: number,
): Page<T> {
  return {
    items: filtered.slice(skip, skip + take),
    hasMore: skip + take < filtered.length,
  };
}
