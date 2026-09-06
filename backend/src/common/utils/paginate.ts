import { SEARCH_SCAN_LIMIT } from '../constants/search-scan-limit';

// Shared shape for every in-app fuzzy-matched admin list endpoint (see
// SEARCH_SCAN_LIMIT): the DB query is already bounded, fuzzy-matching then
// runs over that bounded set, and this applies the final page slice —
// mirrors audit-log.service.ts's original skip/take-over-filtered-rows
// pattern, now shared instead of duplicated per controller.
export const DEFAULT_PAGE_SIZE = 20;

export interface Page<T> {
  items: T[];
  hasMore: boolean;
  // True when the pre-filter scan hit SEARCH_SCAN_LIMIT: the list is a
  // window over the newest rows, not the whole table, and a search miss
  // may be a row outside that window rather than a true absence.
  //
  // Before this existed, `hasMore` was derived from the already-
  // truncated array, so reaching the end of the window looked exactly
  // like reaching the end of the data: past 1,000 rows an admin
  // searching for an account that signed up 1,200 accounts ago got zero
  // results and "no more", and — because tickets were scanned oldest-
  // first — new tickets stopped appearing at all. The UI now shows a
  // notice when this is set.
  truncated: boolean;
}

export function paginate<T>(
  filtered: T[],
  skip: number,
  take: number,
  scannedRows: number,
): Page<T> {
  return {
    items: filtered.slice(skip, skip + take),
    hasMore: skip + take < filtered.length,
    truncated: scannedRows >= SEARCH_SCAN_LIMIT,
  };
}
