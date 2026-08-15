import { fuzzyMatch, searchableText } from './fuzzy-match';

describe('fuzzyMatch', () => {
  it('matches an exact substring', () => {
    expect(fuzzyMatch('John Smith', 'smith')).toBe(true);
  });

  it('matches non-contiguous characters in order (subsequence)', () => {
    expect(fuzzyMatch('John A. Smith', 'jsmith')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(fuzzyMatch('ACME Corp', 'acme')).toBe(true);
  });

  it('rejects when a needle character never appears', () => {
    expect(fuzzyMatch('John Smith', 'zzz')).toBe(false);
  });

  it('rejects when needle characters are present but out of order', () => {
    expect(fuzzyMatch('Smith', 'this')).toBe(false);
  });

  it('treats a blank/whitespace needle as matching everything', () => {
    expect(fuzzyMatch('anything', '')).toBe(true);
    expect(fuzzyMatch('anything', '   ')).toBe(true);
  });
});

describe('searchableText', () => {
  it('joins only the non-null fields', () => {
    expect(searchableText('John', null, 'Smith', undefined)).toBe('John Smith');
  });
});
