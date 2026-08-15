import { randomInt } from 'crypto';

const LOWER = 'abcdefghijkmnpqrstuvwxyz'; // no l/o — avoids look-alike chars
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O
const DIGITS = '23456789'; // no 0/1
const SYMBOLS = '!@#$%&*?';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

function pick(charset: string): string {
  return charset[randomInt(charset.length)];
}

// One-time credential shown to an admin exactly once and never stored —
// guaranteed to satisfy Clerk's default password policy (length +
// character variety) so account creation never fails on a policy check
// the admin has no way to see in advance. Look-alike characters (0/O,
// 1/l/I) are excluded so it's practical to read aloud or retype.
export function generateTempPassword(length = 14): string {
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
