import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import sodium from 'libsodium-wrappers';
import { KekKeyStore } from './kek-key-store.service';

const ALGORITHM = 'aes-256-gcm';
const NONCE_LENGTH = 12;
// GCM's forgery resistance degrades sharply with a shorter tag — without
// an explicit authTagLength, decryption trusts whatever length the
// stored/attacker-supplied tag buffer happens to be rather than
// requiring the full-strength 16 bytes this service always produces on
// encrypt. Pinned on both ends so encrypt/decrypt agree by construction,
// not by convention.
const AUTH_TAG_LENGTH = 16;

export interface EncryptedTotpSecret {
  totpCiphertext: string;
  totpNonce: string;
  totpAuthTag: string;
  totpWrappedDek: string;
  totpKekKeyId: string;
}

// Envelope encryption for TOTP secrets. See KekKeyStore for key management.
@Injectable()
export class TotpCryptoService {
  constructor(private readonly kekStore: KekKeyStore) {}

  async encryptSecret(plainSecret: string): Promise<EncryptedTotpSecret> {
    await sodium.ready;

    const dek = sodium.randombytes_buf(32);
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv(ALGORITHM, dek, nonce, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const ciphertext = Buffer.concat([
      cipher.update(plainSecret, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const { keyId, publicKey } = await this.kekStore.getActivePublicKey();
    const wrappedDek = sodium.crypto_box_seal(dek, publicKey);

    sodium.memzero(dek);

    return {
      totpCiphertext: ciphertext.toString('base64'),
      totpNonce: nonce.toString('base64'),
      totpAuthTag: authTag.toString('base64'),
      totpWrappedDek: sodium.to_base64(wrappedDek),
      totpKekKeyId: keyId,
    };
  }

  async decryptSecret(record: EncryptedTotpSecret): Promise<string> {
    await sodium.ready;

    const privateKey = this.kekStore.getPrivateKey(record.totpKekKeyId);
    const publicKey = await this.kekStore.getPublicKey(record.totpKekKeyId);

    const dek = sodium.crypto_box_seal_open(
      sodium.from_base64(record.totpWrappedDek),
      publicKey,
      privateKey,
    );
    if (!dek) {
      throw new InternalServerErrorException(
        'Failed to unwrap DEK — corrupted data or wrong key',
      );
    }

    try {
      const authTag = Buffer.from(record.totpAuthTag, 'base64');
      if (authTag.length !== AUTH_TAG_LENGTH) {
        // A short/truncated tag is exactly what weakens GCM's forgery
        // resistance — reject it outright rather than letting
        // setAuthTag accept whatever length was stored.
        throw new InternalServerErrorException('Invalid auth tag length');
      }
      const decipher = createDecipheriv(
        ALGORITHM,
        dek,
        Buffer.from(record.totpNonce, 'base64'),
        { authTagLength: AUTH_TAG_LENGTH },
      );
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(record.totpCiphertext, 'base64')),
        decipher.final(), // throws if the auth tag doesn't match — tamper detection
      ]);
      return plaintext.toString('utf8');
    } finally {
      sodium.memzero(dek);
    }
  }
}
