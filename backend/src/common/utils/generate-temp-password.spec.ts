import { generateTempPassword } from './generate-temp-password';

describe('generateTempPassword', () => {
  it('always includes at least one lowercase, uppercase, digit, and symbol', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generateTempPassword();
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[!@#$%&*?]/);
    }
  });

  it('never contains look-alike characters (0/O, 1/l/I)', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateTempPassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it('respects the requested length', () => {
    expect(generateTempPassword(20)).toHaveLength(20);
  });

  it('produces different passwords across calls', () => {
    const passwords = new Set(
      Array.from({ length: 20 }, () => generateTempPassword()),
    );
    expect(passwords.size).toBe(20);
  });
});
