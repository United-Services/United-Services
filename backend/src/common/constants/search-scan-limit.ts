// Caps how many rows an in-app fuzzy-matched admin list endpoint pulls
// before filtering/paginating in-app (see audit-log.service.ts, the
// original of this pattern) — a generous bound for admin-panel scale, not
// a real pagination limit. Every admin list endpoint that fuzzy-matches
// in-app (fuzzy-match.ts can't be pushed into a SQL WHERE) should bound its
// findMany with this instead of returning the whole table unpaginated.
export const SEARCH_SCAN_LIMIT = 1000;
