import { paginate } from './paginate';

// Shared by every in-app-fuzzy-matched admin list endpoint (rfq, file-access,
// candidates, admin-users, appointments controllers) — one bug here is a
// bug in all of them at once, so it's worth covering directly rather than
// relying on each controller's own tests to happen to exercise it.
describe('paginate', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('returns the requested slice with hasMore=true when more remain', () => {
    const result = paginate(items, 0, 2);
    expect(result).toEqual({ items: ['a', 'b'], hasMore: true });
  });

  it('returns the last page with hasMore=false when the slice reaches the end exactly', () => {
    const result = paginate(items, 3, 2);
    expect(result).toEqual({ items: ['d', 'e'], hasMore: false });
  });

  it('skip beyond the total length returns an empty page, not an error', () => {
    const result = paginate(items, 100, 20);
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it('skip exactly at the total length returns an empty page', () => {
    const result = paginate(items, items.length, 10);
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it('take=0 returns an empty page but still reports hasMore correctly', () => {
    const result = paginate(items, 0, 0);
    expect(result).toEqual({ items: [], hasMore: true });
  });

  it('an empty input array always returns an empty page with hasMore=false', () => {
    const result = paginate([], 0, 20);
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it('take larger than the remaining items returns everything left, hasMore=false', () => {
    const result = paginate(items, 4, 50);
    expect(result).toEqual({ items: ['e'], hasMore: false });
  });

  // Documents actual behavior rather than asserting an opinion on
  // correctness — ParseIntPipe on the controllers' `skip`/`take` query
  // params allows negative integers through (no @Min(0) validator), and
  // Array.prototype.slice treats a negative start as "from the end," not
  // as an invalid/clamped-to-zero offset. A caller sending `skip=-1`
  // currently gets the last item instead of a 400 or the first page —
  // silently wrong, not rejected. Locks in the current shape so a future
  // fix (clamping skip/take to >= 0 at the controller boundary) shows up
  // as an intentional test change, not a silent behavior shift.
  it('a negative skip slices from the end of the array (Array.slice semantics), not from the start', () => {
    // slice(-1, -1+2) = slice(-1, 1) — start (index 4) is past end (index
    // 1), so the slice is empty, even though items clearly exist and
    // hasMore correctly still reports true (more usable data exists, the
    // caller just asked for a nonsensical window into it).
    const result = paginate(items, -1, 2);
    expect(result).toEqual({ items: [], hasMore: true });
  });

  it('a negative take also uses Array.slice end-index semantics, not "zero items"', () => {
    // slice(0, -1) means "everything except the last element" in plain
    // JS — nothing about paginate() special-cases a negative take to
    // mean "return nothing," so a caller sending take=-1 gets all but
    // one item back, silently, instead of a 400 or an empty page.
    const result = paginate(items, 0, -1);
    expect(result).toEqual({ items: ['a', 'b', 'c', 'd'], hasMore: true });
  });
});
