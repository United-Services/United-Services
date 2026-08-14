import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { TOTP } from '@otplib/totp';
import { NobleCryptoPlugin } from '@otplib/plugin-crypto-noble';
import { ScureBase32Plugin } from '@otplib/plugin-base32-scure';
import * as QRCode from 'qrcode';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TotpCryptoService } from '../crypto/totp-crypto.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { User } from '../generated/prisma';

const CHALLENGE_TTL_SECONDS = 300;
const RP_NAME = 'United Services Egypt';

// Prisma stores this as a plain string[] (no enum at the DB level); cast
// once at the boundary to @simplewebauthn's stricter literal-union type
// rather than sprinkling `as any` at every call site.
const asTransports = (transports: string[]) =>
  transports as AuthenticatorTransportFuture[];

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly totpCrypto: TotpCryptoService,
    private readonly auditLog: AuditLogService,
  ) {}

  private get rpId() {
    return process.env.WEBAUTHN_RP_ID ?? 'localhost';
  }

  private get origin() {
    return process.env.WEBAUTHN_RP_ORIGIN ?? 'http://localhost:3000';
  }

  private challengeKey(userId: string, kind: 'reg' | 'auth') {
    return `webauthn:${kind}:${userId}`;
  }

  private totpLastStepKey(userId: string) {
    return `totp:last-step:${userId}`;
  }

  // otplib's built-in replay guard: verification rejects any time step at
  // or before the last one that was successfully used, so a captured code
  // can't be replayed a second time within its own tolerance window (a
  // plain .verify() call has no memory of prior successes — the same
  // valid code would otherwise pass every time it's resubmitted).
  private async getAfterTimeStep(userId: string): Promise<number | undefined> {
    const stored = await this.redis.get(this.totpLastStepKey(userId));
    return stored ? Number(stored) : undefined;
  }

  // A plain GET-then-SET here would be a real race: two concurrent
  // requests carrying the identical still-valid code both read the same
  // stale afterTimeStep, both pass .verify(), and both would then record
  // "success" — the second call's code was, in effect, replayed. This
  // Lua script makes the read-compare-write a single atomic Redis
  // operation, so only the request whose timeStep is genuinely newer than
  // whatever's currently stored ever wins; the loser gets `recorded:
  // false` and must be treated as an invalid/replayed attempt even though
  // its own .verify() call succeeded.
  private static readonly RECORD_TIME_STEP_SCRIPT = `
    local current = redis.call('GET', KEYS[1])
    if (not current) or tonumber(ARGV[1]) > tonumber(current) then
      redis.call('SET', KEYS[1], ARGV[1])
      return 1
    end
    return 0
  `;

  // Returns false if this exact time step (or a newer one) was already
  // recorded by a concurrent request — the caller must treat that as a
  // failed/replayed verification, not a successful one.
  private async recordUsedTimeStep(
    userId: string,
    timeStep: number,
  ): Promise<boolean> {
    const result = await this.redis.eval(
      MfaService.RECORD_TIME_STEP_SCRIPT,
      1,
      this.totpLastStepKey(userId),
      String(timeStep),
    );
    return result === 1;
  }

  private makeTotp(label: string, secret?: string) {
    return new TOTP({
      ...(secret ? { secret } : {}),
      label,
      issuer: RP_NAME,
      crypto: new NobleCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    });
  }

  async status(user: User) {
    const [totp, webauthnCredentials] = await Promise.all([
      this.prisma.totpCredential.findUnique({ where: { userId: user.id } }),
      this.prisma.webAuthnCredential.findMany({
        where: { userId: user.id },
        select: { id: true, label: true, deviceType: true, createdAt: true },
      }),
    ]);
    return {
      mfaEnrolled: user.mfaEnrolled,
      totpEnrolled: !!totp?.confirmedAt,
      webauthnCredentials,
    };
  }

  // ── TOTP ──────────────────────────────────────────────────────────────

  async enrollTotp(user: User) {
    const secret = this.makeTotp(user.email).generateSecret();
    const envelope = await this.totpCrypto.encryptSecret(secret);
    await this.prisma.totpCredential.upsert({
      where: { userId: user.id },
      update: { ...envelope, confirmedAt: null },
      create: { userId: user.id, ...envelope },
    });
    const otpauthUrl = this.makeTotp(user.email, secret).toURI();
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  async confirmTotp(user: User, code: string) {
    const credential = await this.prisma.totpCredential.findUnique({
      where: { userId: user.id },
    });
    if (!credential)
      throw new BadRequestException('No TOTP enrollment in progress');

    const secret = await this.totpCrypto.decryptSecret(credential);
    const afterTimeStep = await this.getAfterTimeStep(user.id);
    const result = await this.makeTotp(user.email, secret).verify(code, {
      epochTolerance: 30,
      afterTimeStep,
    });
    if (!result.valid) throw new BadRequestException('Invalid code');
    const recorded = await this.recordUsedTimeStep(user.id, result.timeStep);
    if (!recorded) throw new BadRequestException('Invalid code');

    await this.prisma.$transaction([
      this.prisma.totpCredential.update({
        where: { userId: user.id },
        data: { confirmedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { mfaEnrolled: true },
      }),
    ]);
    return { success: true };
  }

  async verifyTotp(user: User, code: string): Promise<boolean> {
    const credential = await this.prisma.totpCredential.findUnique({
      where: { userId: user.id },
    });
    if (!credential?.confirmedAt) return false;
    const secret = await this.totpCrypto.decryptSecret(credential);
    const afterTimeStep = await this.getAfterTimeStep(user.id);
    const result = await this.makeTotp(user.email, secret).verify(code, {
      epochTolerance: 30,
      afterTimeStep,
    });
    if (!result.valid) return false;
    const recorded = await this.recordUsedTimeStep(user.id, result.timeStep);
    if (!recorded) return false;

    await this.rewrapIfKekRetiring(user, credential.totpKekKeyId, secret);
    return true;
  }

  // Rotation-in-use: on a successful TOTP verification, if the secret was
  // still wrapped under a "retiring" KEK, re-wrap it under the current
  // active key right away rather than waiting for a background job. Never
  // logs key material or the plaintext secret — only which key ids moved.
  private async rewrapIfKekRetiring(
    user: User,
    currentKeyId: string,
    plainSecret: string,
  ) {
    const kek = await this.prisma.kekRegistry.findUnique({
      where: { keyId: currentKeyId },
    });
    if (kek?.status !== 'retiring') return;

    const envelope = await this.totpCrypto.encryptSecret(plainSecret);
    await this.prisma.$transaction([
      this.prisma.totpCredential.update({
        where: { userId: user.id },
        data: envelope,
      }),
    ]);
    await this.auditLog.record({
      actorUserId: user.id,
      action: 'mfa.totp_rewrapped',
      targetType: 'TotpCredential',
      targetId: user.id,
      metadata: { fromKeyId: currentKeyId, toKeyId: envelope.totpKekKeyId },
    });
  }

  // ── WebAuthn ─────────────────────────────────────────────────────────

  async webauthnRegisterOptions(
    user: User,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const existing = await this.prisma.webAuthnCredential.findMany({
      where: { userId: user.id },
    });
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: this.rpId,
      userName: user.email,
      userDisplayName: `${user.firstName} ${user.lastName}`,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: asTransports(c.transports),
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });
    await this.redis.set(
      this.challengeKey(user.id, 'reg'),
      options.challenge,
      'EX',
      CHALLENGE_TTL_SECONDS,
    );
    return options;
  }

  async webauthnRegisterVerify(
    user: User,
    response: RegistrationResponseJSON,
    label?: string,
  ) {
    const expectedChallenge = await this.redis.get(
      this.challengeKey(user.id, 'reg'),
    );
    if (!expectedChallenge)
      throw new BadRequestException(
        'Registration challenge expired — please try again',
      );

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Could not verify registration');
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;
    try {
      await this.prisma.$transaction([
        this.prisma.webAuthnCredential.create({
          data: {
            userId: user.id,
            credentialId: credential.id,
            publicKey: Buffer.from(credential.publicKey),
            counter: BigInt(credential.counter),
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            transports: credential.transports ?? [],
            label,
          },
        }),
        this.prisma.user.update({
          where: { id: user.id },
          data: { mfaEnrolled: true },
        }),
      ]);
    } catch {
      throw new ConflictException('This authenticator is already registered');
    } finally {
      await this.redis.del(this.challengeKey(user.id, 'reg'));
    }

    return { success: true };
  }

  async webauthnAuthOptions(
    user: User,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const credentials = await this.prisma.webAuthnCredential.findMany({
      where: { userId: user.id },
    });
    if (credentials.length === 0)
      throw new BadRequestException('No WebAuthn credentials registered');

    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      userVerification: 'preferred',
      allowCredentials: credentials.map((c) => ({
        id: c.credentialId,
        transports: asTransports(c.transports),
      })),
    });
    await this.redis.set(
      this.challengeKey(user.id, 'auth'),
      options.challenge,
      'EX',
      CHALLENGE_TTL_SECONDS,
    );
    return options;
  }

  async webauthnAuthVerify(
    user: User,
    response: AuthenticationResponseJSON,
  ): Promise<boolean> {
    const expectedChallenge = await this.redis.get(
      this.challengeKey(user.id, 'auth'),
    );
    if (!expectedChallenge) return false;

    const stored = await this.prisma.webAuthnCredential.findUnique({
      where: { credentialId: response.id },
    });
    if (!stored || stored.userId !== user.id) return false;

    try {
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
        credential: {
          id: stored.credentialId,
          publicKey: new Uint8Array(stored.publicKey),
          counter: Number(stored.counter),
          transports: asTransports(stored.transports),
        },
      });
      if (verification.verified) {
        await this.prisma.webAuthnCredential.update({
          where: { id: stored.id },
          data: { counter: BigInt(verification.authenticationInfo.newCounter) },
        });
      }
      return verification.verified;
    } finally {
      await this.redis.del(this.challengeKey(user.id, 'auth'));
    }
  }
}
