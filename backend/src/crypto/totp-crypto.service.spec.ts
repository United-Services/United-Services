import { TotpCryptoService } from './totp-crypto.service';
import { FakeKekKeyStore } from './testing/fake-kek-key-store';

// TOTP secrets are the one thing that must never leak in plaintext from a
// DB dump — this suite exercises the real envelope-encryption scheme
// (random per-secret DEK, AES-256-GCM, sealed to a real ephemeral
// libsodium keypair) with no mocking of the crypto itself.
describe('TotpCryptoService', () => {
  it('round-trips a secret through encrypt -> decrypt', async () => {
    const store = await FakeKekKeyStore.create();
    store.addActiveKey('kek-test-1');
    const crypto = new TotpCryptoService(store.asKekKeyStore());

    const envelope = await crypto.encryptSecret('JBSWY3DPEHPK3PXP');
    expect(envelope.totpKekKeyId).toBe('kek-test-1');
    expect(envelope.totpCiphertext).not.toContain('JBSWY3DPEHPK3PXP');

    await expect(crypto.decryptSecret(envelope)).resolves.toBe(
      'JBSWY3DPEHPK3PXP',
    );
  });

  it('still decrypts a secret wrapped under a key that has since moved to "retiring"', async () => {
    const store = await FakeKekKeyStore.create();
    store.addActiveKey('kek-2025-01-01');
    const crypto = new TotpCryptoService(store.asKekKeyStore());

    const envelope = await crypto.encryptSecret('OLDSECRETVALUE');

    // Simulate rotation: a new key becomes active, but the old one's
    // private key is still loaded (status moved to "retiring", not
    // deleted) so old ciphertexts stay decryptable.
    store.addActiveKey('kek-2026-01-01');

    await expect(crypto.decryptSecret(envelope)).resolves.toBe(
      'OLDSECRETVALUE',
    );
  });

  it('throws when the auth tag has been tampered with', async () => {
    const store = await FakeKekKeyStore.create();
    store.addActiveKey('kek-test-1');
    const crypto = new TotpCryptoService(store.asKekKeyStore());

    const envelope = await crypto.encryptSecret('JBSWY3DPEHPK3PXP');
    const tampered = {
      ...envelope,
      totpAuthTag: Buffer.from('0'.repeat(32), 'hex').toString('base64'),
    };

    await expect(crypto.decryptSecret(tampered)).rejects.toThrow();
  });

  it('throws when the ciphertext has been tampered with', async () => {
    const store = await FakeKekKeyStore.create();
    store.addActiveKey('kek-test-1');
    const crypto = new TotpCryptoService(store.asKekKeyStore());

    const envelope = await crypto.encryptSecret('JBSWY3DPEHPK3PXP');
    const flipped = Buffer.from(envelope.totpCiphertext, 'base64');
    flipped[0] ^= 0xff;
    const tampered = {
      ...envelope,
      totpCiphertext: flipped.toString('base64'),
    };

    await expect(crypto.decryptSecret(tampered)).rejects.toThrow();
  });

  it('throws a clear error for an unknown/retired keyId rather than returning garbage', async () => {
    const store = await FakeKekKeyStore.create();
    store.addActiveKey('kek-test-1');
    const crypto = new TotpCryptoService(store.asKekKeyStore());

    const envelope = await crypto.encryptSecret('JBSWY3DPEHPK3PXP');
    store.removeKey('kek-test-1'); // simulate the key having been retired and its file deleted

    await expect(crypto.decryptSecret(envelope)).rejects.toThrow(
      /No private key loaded/,
    );
  });
});
