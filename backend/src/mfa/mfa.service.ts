import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
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
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EncryptionService } from '../crypto/encryption.service';
import type { User } from '../generated/prisma';

const CHALLENGE_TTL_SECONDS = 300;
const RP_NAME = 'United Services Egypt';

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly encryption: EncryptionService,
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
    await this.prisma.totpCredential.upsert({
      where: { userId: user.id },
      update: { secretEncrypted: this.encryption.encrypt(secret), confirmedAt: null },
      create: { userId: user.id, secretEncrypted: this.encryption.encrypt(secret) },
    });
    const otpauthUrl = this.makeTotp(user.email, secret).toURI();
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  async confirmTotp(user: User, code: string) {
    const credential = await this.prisma.totpCredential.findUnique({ where: { userId: user.id } });
    if (!credential) throw new BadRequestException('No TOTP enrollment in progress');

    const secret = this.encryption.decrypt(credential.secretEncrypted);
    const result = await this.makeTotp(user.email, secret).verify(code, { epochTolerance: 30 });
    if (!result.valid) throw new BadRequestException('Invalid code');

    await this.prisma.$transaction([
      this.prisma.totpCredential.update({ where: { userId: user.id }, data: { confirmedAt: new Date() } }),
      this.prisma.user.update({ where: { id: user.id }, data: { mfaEnrolled: true } }),
    ]);
    return { success: true };
  }

  async verifyTotp(user: User, code: string): Promise<boolean> {
    const credential = await this.prisma.totpCredential.findUnique({ where: { userId: user.id } });
    if (!credential?.confirmedAt) return false;
    const secret = this.encryption.decrypt(credential.secretEncrypted);
    const result = await this.makeTotp(user.email, secret).verify(code, { epochTolerance: 30 });
    return result.valid;
  }

  // ── WebAuthn ─────────────────────────────────────────────────────────

  async webauthnRegisterOptions(user: User): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const existing = await this.prisma.webAuthnCredential.findMany({ where: { userId: user.id } });
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: this.rpId,
      userName: user.email,
      userDisplayName: `${user.firstName} ${user.lastName}`,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports as any })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    await this.redis.set(this.challengeKey(user.id, 'reg'), options.challenge, 'EX', CHALLENGE_TTL_SECONDS);
    return options;
  }

  async webauthnRegisterVerify(user: User, response: RegistrationResponseJSON, label?: string) {
    const expectedChallenge = await this.redis.get(this.challengeKey(user.id, 'reg'));
    if (!expectedChallenge) throw new BadRequestException('Registration challenge expired — please try again');

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Could not verify registration');
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
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
        this.prisma.user.update({ where: { id: user.id }, data: { mfaEnrolled: true } }),
      ]);
    } catch {
      throw new ConflictException('This authenticator is already registered');
    } finally {
      await this.redis.del(this.challengeKey(user.id, 'reg'));
    }

    return { success: true };
  }

  async webauthnAuthOptions(user: User): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const credentials = await this.prisma.webAuthnCredential.findMany({ where: { userId: user.id } });
    if (credentials.length === 0) throw new BadRequestException('No WebAuthn credentials registered');

    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      userVerification: 'preferred',
      allowCredentials: credentials.map((c) => ({ id: c.credentialId, transports: c.transports as any })),
    });
    await this.redis.set(this.challengeKey(user.id, 'auth'), options.challenge, 'EX', CHALLENGE_TTL_SECONDS);
    return options;
  }

  async webauthnAuthVerify(user: User, response: AuthenticationResponseJSON): Promise<boolean> {
    const expectedChallenge = await this.redis.get(this.challengeKey(user.id, 'auth'));
    if (!expectedChallenge) return false;

    const stored = await this.prisma.webAuthnCredential.findUnique({ where: { credentialId: response.id } });
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
          transports: stored.transports as any,
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
