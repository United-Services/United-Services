import { Injectable, Logger } from '@nestjs/common';
import {
  GetParameterCommand,
  ParameterNotFound,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';

// Durable, off-host copy of every KEK private key.
//
// The keys live in the `kek-keys` Docker volume and, until this
// existed, nowhere else — not in SSM, not in S3, not in the database,
// not in any backup. Lose that volume (disk failure, a routine
// `docker volume prune`, a PITR restore onto a fresh host) and every
// TotpCredential is permanently undecryptable; docs/DISASTER_RECOVERY.md
// described the application as "stateless". SSM Parameter Store is the
// natural home: scripts/fetch-secrets.sh already pulls every other
// secret from `/united-services/<env>/` at container start with the
// same credentials.
//
// Opt-in via KEK_SSM_BACKUP_ENABLED=true. Off by default so CI and local
// development — which run with placeholder AWS credentials — never make
// an SSM call. Production must set it; the rotation worker logs at
// error on every run while it is off.
//
// Two operations:
//   putKey  — called right after a key file is written (rotation worker,
//             and kek-generate.ts). Overwrite: false, so an existing
//             parameter is never clobbered — a keyId is a full ISO
//             timestamp and can't legitimately be re-generated.
//   getKey  — called by KekKeyStore.reload() for a registry row whose
//             key file is missing locally: a fresh volume, a new host, or
//             a replica that hasn't received a key another replica
//             generated. The file is re-materialised at 0400 and loaded.
@Injectable()
export class KekSsmBackup {
  private readonly logger = new Logger(KekSsmBackup.name);
  private client: SSMClient | null = null;

  get enabled(): boolean {
    return process.env.KEK_SSM_BACKUP_ENABLED === 'true';
  }

  private parameterName(keyId: string): string {
    const env = process.env.ENVIRONMENT ?? 'staging';
    return `/united-services/${env}/kek/${keyId}`;
  }

  private get ssm(): SSMClient {
    if (!this.client) {
      this.client = new SSMClient({
        region: process.env.AWS_REGION,
        // SSM is a control-plane call on a rare path; a hung call must
        // not stall a rotation or a boot-time reload indefinitely.
        requestHandler: { requestTimeout: 10_000, connectionTimeout: 5_000 },
      });
    }
    return this.client;
  }

  async putKey(keyId: string, privateKeyBase64: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.ssm.send(
        new PutParameterCommand({
          Name: this.parameterName(keyId),
          Value: privateKeyBase64,
          Type: 'SecureString',
          Overwrite: false,
          Description: `TOTP envelope-encryption KEK private key (${keyId})`,
        }),
      );
      this.logger.warn(`KEK "${keyId}" private key backed up to SSM`);
    } catch (err) {
      // Surfaced loudly but never thrown: the key already exists on the
      // local volume and in the registry, so the rotation itself
      // succeeded — what failed is the durable copy, which is exactly
      // the thing an operator must know about.
      this.logger.error(
        `FAILED to back up KEK "${keyId}" to SSM — the only copy is the local volume: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Returns null when disabled or when SSM has no copy; throws only on a
  // genuine SSM error (so a reload can log it rather than mistake it for
  // "not backed up").
  async getKey(keyId: string): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const res = await this.ssm.send(
        new GetParameterCommand({
          Name: this.parameterName(keyId),
          WithDecryption: true,
        }),
      );
      return res.Parameter?.Value ?? null;
    } catch (err) {
      if (err instanceof ParameterNotFound) return null;
      throw err;
    }
  }
}
