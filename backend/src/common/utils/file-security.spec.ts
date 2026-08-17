import {
  assertNoDisguisedExtension,
  assertSafeFilename,
  matchesContentType,
} from './file-security';

describe('assertNoDisguisedExtension', () => {
  it('rejects a dangerous extension hidden before the final extension', () => {
    expect(() => assertNoDisguisedExtension('shell.php.pdf')).toThrow();
    expect(() => assertNoDisguisedExtension('resume.js.docx')).toThrow();
    expect(() => assertNoDisguisedExtension('invoice.exe.txt')).toThrow();
  });

  it('allows an ordinary single-extension filename', () => {
    expect(() => assertNoDisguisedExtension('resume.pdf')).not.toThrow();
    expect(() => assertNoDisguisedExtension('photo.jpg')).not.toThrow();
  });
});

describe('assertSafeFilename', () => {
  it('rejects path traversal and separators', () => {
    expect(() => assertSafeFilename('../../etc/passwd')).toThrow();
    expect(() => assertSafeFilename('a/b.pdf')).toThrow();
    expect(() => assertSafeFilename('a\\b.pdf')).toThrow();
  });

  it('rejects a disguised double extension', () => {
    expect(() => assertSafeFilename('cv.php.pdf')).toThrow();
  });

  it('allows a normal safe filename', () => {
    expect(() => assertSafeFilename('cv-final (2).pdf')).not.toThrow();
  });
});

describe('matchesContentType', () => {
  it('confirms a real PDF signature', () => {
    expect(
      matchesContentType(Buffer.from('%PDF-1.4', 'latin1'), 'application/pdf'),
    ).toBe(true);
  });

  it('rejects a PHP payload masquerading as a PDF', () => {
    expect(
      matchesContentType(
        Buffer.from('<?php system($_GET[0]); ?>'),
        'application/pdf',
      ),
    ).toBe(false);
  });

  it('confirms a real JPEG/PNG signature', () => {
    expect(
      matchesContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'),
    ).toBe(true);
    expect(
      matchesContentType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        'image/png',
      ),
    ).toBe(true);
  });

  it('confirms a real WEBP signature', () => {
    const buf = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WEBP', 'latin1'),
    ]);
    expect(matchesContentType(buf, 'image/webp')).toBe(true);
  });

  it('rejects a RIFF file that is not actually WEBP', () => {
    const buf = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('AVI ', 'latin1'),
    ]);
    expect(matchesContentType(buf, 'image/webp')).toBe(false);
  });

  it('returns false for an unrecognized content type', () => {
    expect(
      matchesContentType(Buffer.from('anything'), 'application/x-msdownload'),
    ).toBe(false);
  });
});
