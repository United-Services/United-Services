// Subsequence-based fuzzy match (the same approach VS Code's/Sublime's
// command palettes use): `needle` matches `haystack` if every character
// of `needle` appears in `haystack`, in order, with anything in between —
// so "jsmith" matches "John A. Smith", and a typo like "smtih" still
// matches "smith" as long as the letters that ARE present stay in order.
// Case-insensitive; a blank needle matches everything (same as the old
// `contains: ''` behavior it replaces).
export function fuzzyMatch(haystack: string, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  const h = haystack.toLowerCase();

  let hi = 0;
  for (let ni = 0; ni < n.length; ni++) {
    const ch = n[ni];
    const found = h.indexOf(ch, hi);
    if (found === -1) return false;
    hi = found + 1;
  }
  return true;
}

// Joins whichever of a row's searchable fields are non-null into one
// lowercased haystack — the shared shape every list() search filters
// against, so `fuzzyMatch` never has to know a given field is nullable.
export function searchableText(
  ...fields: (string | null | undefined)[]
): string {
  return fields.filter((f): f is string => !!f).join(' ');
}
