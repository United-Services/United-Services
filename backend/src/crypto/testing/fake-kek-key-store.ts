import sodium from 'libsodium-wrappers';
import type { KekKeyStore } from '../kek-key-store.service';

// Real libsodium keypairs, held only in memory — no disk, no DB, no
// mocking of the crypto itself. Lets tests exercise TotpCryptoService
// exactly as it runs in production, including multi-key rotation
// scenarios (an "active" key plus one or more "retiring" ones).
export class FakeKekKeyStore {
  private keys = new Map<
    string,
    { publicKey: Uint8Array; privateKey: Uint8Array }
  >();
  private activeKeyId: string | null = null;

  static async create(): Promise<FakeKekKeyStore> {
    await sodium.ready;
    return new FakeKekKeyStore();
  }

  addActiveKey(keyId: string): { keyId: string } {
    const pair = sodium.crypto_box_keypair();
    this.keys.set(keyId, {
      publicKey: pair.publicKey,
      privateKey: pair.privateKey,
    });
    this.activeKeyId = keyId;
    return { keyId };
  }

  addRetiringKey(keyId: string): { keyId: string } {
    const pair = sodium.crypto_box_keypair();
    this.keys.set(keyId, {
      publicKey: pair.publicKey,
      privateKey: pair.privateKey,
    });
    return { keyId };
  }

  removeKey(keyId: string) {
    this.keys.delete(keyId);
  }

  getPrivateKey(keyId: string): Uint8Array {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`No private key loaded for KEK "${keyId}"`);
    return key.privateKey;
  }

  getPublicKey(keyId: string): Promise<Uint8Array> {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Unknown KEK "${keyId}"`);
    return Promise.resolve(key.publicKey);
  }

  getActivePublicKey(): Promise<{ keyId: string; publicKey: Uint8Array }> {
    if (!this.activeKeyId) throw new Error('No active KEK');
    const key = this.keys.get(this.activeKeyId)!;
    return Promise.resolve({
      keyId: this.activeKeyId,
      publicKey: key.publicKey,
    });
  }

  asKekKeyStore(): KekKeyStore {
    return this as unknown as KekKeyStore;
  }
}
