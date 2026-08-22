import { createHash, randomInt } from 'crypto';

const LOWER = 'abcdefghijkmnpqrstuvwxyz'; // no l/o — avoids look-alike chars
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O
const DIGITS = '23456789'; // no 0/1
const SYMBOLS = '!@#$%&*?';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

function pick(charset: string): string {
  return charset[randomInt(charset.length)];
}

function generateOnce(length: number): string {
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: length - required.length }, () =>
    pick(ALL),
  );
  const chars = [...required, ...rest];
  // Fisher-Yates shuffle — otherwise the four guaranteed-category
  // characters would always land first, making generated passwords
  // trivially distinguishable/predictable in their first few characters.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// Never stores the plaintext password itself (that would be a much worse
// security posture than the collision this guards against) — just a
// one-way hash of every password issued since this process started, so a
// same-instance repeat is provably impossible on top of the already-
// negligible odds from 14 chars over a ~70-char alphabet (~70^14, roughly
// 10^25 possibilities — far beyond any realistic collision risk on its
// own; this is defense in depth, not a load-bearing guarantee).
const issuedHashes = new Set<string>();
function fingerprint(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

// One-time credential shown to an admin exactly once and never stored —
// guaranteed to satisfy Clerk's default password policy (length +
// character variety) so account creation never fails on a policy check
// the admin has no way to see in advance. Look-alike characters (0/O,
// 1/l/I) are excluded so it's practical to read aloud or retype. Backed by
// Node's crypto.randomInt (CSPRNG, not Math.random) for every character
// choice and the shuffle.
export function generateTempPassword(length = 14): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const password = generateOnce(length);
    const hash = fingerprint(password);
    if (!issuedHashes.has(hash)) {
      issuedHashes.add(hash);
      return password;
    }
  }
  // Astronomically unlikely to ever be reached (see issuedHashes comment)
  // — if it is, the search space itself is exhausted for this length, so
  // widen it rather than retry forever.
  return generateTempPassword(length + 1);
}
