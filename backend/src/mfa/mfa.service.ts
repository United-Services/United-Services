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
// Housekeeping TTL only, so Redis doesn't hold abandoned session records forever.
const SESSION_VERIFIED_TTL_SECONDS = 60 * 60 * 24 * 30;
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

  private sessionVerifiedKey(sessionId: string) {
    return `mfa:session-verified:${sessionId}`;
  }

  // Per-session verification check — see MfaSessionVerifiedGuard.
  async isSessionVerified(sessionId: string): Promise<boolean> {
    return (await this.redis.get(this.sessionVerifiedKey(sessionId))) !== null;
  }

  async markSessionVerified(sessionId: string): Promise<void> {
    await this.redis.set(
      this.sessionVerifiedKey(sessionId),
      '1',
      'EX',
      SESSION_VERIFIED_TTL_SECONDS,
    );
  }

  // TOTP replay protection — see recordUsedTimeStep below.
  private async getAfterTimeStep(userId: string): Promise<number | undefined> {
    const stored = await this.redis.get(this.totpLastStepKey(userId));
    return stored ? Number(stored) : undefined;
  }

  // Atomic read-compare-write to avoid a race between concurrent requests
  // using the same code.
  private static readonly RECORD_TIME_STEP_SCRIPT = `
    local current = redis.call('GET', KEYS[1])
    if (not current) or tonumber(ARGV[1]) > tonumber(current) then
      redis.call('SET', KEYS[1], ARGV[1])
      return 1
    end
    return 0
  `;

  // Returns false if this attempt should be treated as a replay.
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

  // Self-service delete of the admin's authenticator app enrollment
  // (Security page) — same "never strand the account with zero working MFA
  // methods" guard as deleteWebauthnCredential below.
  async deleteTotpCredential(user: User) {
    const [totp, webauthnCount] = await Promise.all([
      this.prisma.totpCredential.findUnique({ where: { userId: user.id } }),
      this.prisma.webAuthnCredential.count({ where: { userId: user.id } }),
    ]);
    if (!totp?.confirmedAt) {
      throw new BadRequestException(
        'No confirmed authenticator app enrollment',
      );
    }
    if (webauthnCount === 0) {
      throw new ConflictException(
        'This is your only MFA method — add another authenticator before removing this one',
      );
    }

    await this.prisma.totpCredential.delete({ where: { userId: user.id } });
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

  // Opportunistic re-wrap of the secret under the active KEK on successful verification.
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
        // Restricts registration to a device-bound biometric sensor
        // (Touch ID, Face ID, Windows Hello, Android fingerprint) —
        // 'cross-platform' would also accept a roaming USB/NFC security
        // key, which is a different credential class than what "biometric"
        // is meant to offer here. WebAuthn has no narrower concept than
        // "platform authenticator" — it can't distinguish fingerprint from
        // face/PIN at the protocol level, so this is the closest available
        // restriction, paired with requiring user verification below so
        // the platform's own biometric/PIN prompt can't be skipped.
        authenticatorAttachment: 'platform',
        // 'discouraged' keeps this a traditional, non-discoverable
        // credential scoped to this one enrollment — 'preferred'/
        // 'required' is what turns a credential into a synced, username-
        // less *passkey* (iCloud Keychain/Google Password Manager), which
        // is explicitly not what was asked for here.
        residentKey: 'discouraged',
        userVerification: 'required',
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

  // Self-service delete of one of the admin's own WebAuthn credentials
  // (Security page) — never lets the account end up with zero working MFA
  // methods, which would otherwise strand the admin on their *next*
  // sign-in: MfaSessionVerifiedGuard demands a fresh challenge every new
  // session, and there'd be nothing left to challenge with. "Replace" is
  // just delete-then-add from the UI's perspective — enrolling a new one
  // first, then removing the old, always keeps at least one valid during
  // the swap.
  async deleteWebauthnCredential(user: User, credentialId: string) {
    const credential = await this.prisma.webAuthnCredential.findUnique({
      where: { id: credentialId },
    });
    if (!credential || credential.userId !== user.id) {
      throw new BadRequestException('Credential not found');
    }

    const [totp, remainingCount] = await Promise.all([
      this.prisma.totpCredential.findUnique({ where: { userId: user.id } }),
      this.prisma.webAuthnCredential.count({ where: { userId: user.id } }),
    ]);
    const wouldHaveNoMethodsLeft = !totp?.confirmedAt && remainingCount <= 1;
    if (wouldHaveNoMethodsLeft) {
      throw new ConflictException(
        'This is your only MFA method — add another authenticator before removing this one',
      );
    }

    await this.prisma.webAuthnCredential.delete({
      where: { id: credentialId },
    });
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
      // Matches the 'required' set at registration (webauthnRegisterOptions)
      // — 'preferred' would let an authenticator skip the biometric/PIN
      // prompt it was specifically registered to require.
      userVerification: 'required',
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
