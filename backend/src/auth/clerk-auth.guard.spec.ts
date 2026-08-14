import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { Role, Prisma } from '../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

const verifyTokenMock = jest.fn();
const getUserMock = jest.fn();
jest.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => verifyTokenMock(...args),
  createClerkClient: () => ({
    users: { getUser: (...args: unknown[]) => getUserMock(...args) },
  }),
}));

// This guard is what stands between an unauthenticated request and every
// non-@Public() route in the app — re-verifying against our own DB rather
// than trusting a Clerk claim directly (docs/BUSINESS_RULES.md). @clerk/backend
// itself is mocked (it's a real network call to Clerk's servers), everything
// downstream of the token is real guard logic.
describe('ClerkAuthGuard', () => {
  let prisma: { user: any };

  function contextFor(request: any, isPublic = false) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(isPublic),
    } as unknown as Reflector;
    const g = new ClerkAuthGuard(reflector, prisma as unknown as PrismaService);
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { g, context };
  }

  beforeEach(() => {
    verifyTokenMock.mockReset();
    getUserMock.mockReset();
    prisma = { user: { findUnique: jest.fn(), upsert: jest.fn() } };
  });

  it('allows a @Public() route through with no token at all', async () => {
    const { g, context } = contextFor({ headers: {}, cookies: {} }, true);
    await expect(g.canActivate(context)).resolves.toBe(true);
    expect(verifyTokenMock).not.toHaveBeenCalled();
  });

  it('rejects a non-public route with no session token', async () => {
    const { g, context } = contextFor({ headers: {}, cookies: {} });
    await expect(g.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an invalid/expired token', async () => {
    verifyTokenMock.mockRejectedValue(new Error('bad token'));
    const { g, context } = contextFor({
      headers: { authorization: 'Bearer bad' },
      cookies: {},
    });
    await expect(g.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a verified token that carries no session id (sid)', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'clerk-1' });
    const { g, context } = contextFor({
      headers: { authorization: 'Bearer t' },
      cookies: {},
    });
    await expect(g.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('attaches the verified sid to the request for downstream MFA-session checks', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'clerk-1', sid: 'sess_42' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      clerkId: 'clerk-1',
      disabledAt: null,
      role: Role.client,
    });
    const request = {
      headers: { authorization: 'Bearer t' },
      cookies: {},
    } as any;
    const { g, context } = contextFor(request);

    await g.canActivate(context);

    expect(request.sessionId).toBe('sess_42');
  });

  it('reads the token from the __session cookie in preference to the Authorization header', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'clerk-1', sid: 'sess_1' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      clerkId: 'clerk-1',
      disabledAt: null,
      role: Role.client,
    });
    const { g, context } = contextFor({
      headers: { authorization: 'Bearer header-token' },
      cookies: { __session: 'cookie-token' },
    });

    await g.canActivate(context);

    expect(verifyTokenMock).toHaveBeenCalledWith(
      'cookie-token',
      expect.anything(),
    );
  });

  it('attaches the local User row to the request for an existing user', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'clerk-1', sid: 'sess_1' });
    const user = {
      id: 'u1',
      clerkId: 'clerk-1',
      disabledAt: null,
      role: Role.client,
    };
    prisma.user.findUnique.mockResolvedValue(user);
    const request = {
      headers: { authorization: 'Bearer t' },
      cookies: {},
    } as any;
    const { g, context } = contextFor(request);

    await expect(g.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBe(user);
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it('rejects a disabled account even with a valid token', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'clerk-1', sid: 'sess_1' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      clerkId: 'clerk-1',
      disabledAt: new Date(),
      role: Role.client,
    });
    const { g, context } = contextFor({
      headers: { authorization: 'Bearer t' },
      cookies: {},
    });

    await expect(g.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('self-heals by provisioning a client-role user when the webhook has not landed yet', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'clerk-1', sid: 'sess_1' });
    prisma.user.findUnique.mockResolvedValue(null);
    getUserMock.mockResolvedValue({
      id: 'clerk-1',
      primaryEmailAddressId: 'em1',
      emailAddresses: [{ id: 'em1', emailAddress: 'new@client.com' }],
      firstName: 'New',
      lastName: 'Client',
      phoneNumbers: [],
      unsafeMetadata: { companyName: 'Acme' },
    });
    const provisioned = {
      id: 'u2',
      clerkId: 'clerk-1',
      disabledAt: null,
      role: Role.client,
      email: 'new@client.com',
    };
    prisma.user.upsert.mockResolvedValue(provisioned);
    const request = {
      headers: { authorization: 'Bearer t' },
      cookies: {},
    } as any;
    const { g, context } = contextFor(request);

    await expect(g.canActivate(context)).resolves.toBe(true);

    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          role: Role.client,
          email: 'new@client.com',
          companyName: 'Acme',
        }),
      }),
    );
    expect(request.user).toBe(provisioned);
  });

  it('recovers when a concurrent self-heal request wins the create race (P2002)', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'clerk-1', sid: 'sess_1' });
    getUserMock.mockResolvedValue({
      id: 'clerk-1',
      primaryEmailAddressId: 'em1',
      emailAddresses: [{ id: 'em1', emailAddress: 'new@client.com' }],
      firstName: 'New',
      lastName: 'Client',
      phoneNumbers: [],
      unsafeMetadata: {},
    });
    const wonByOtherRequest = {
      id: 'u2',
      clerkId: 'clerk-1',
      disabledAt: null,
      role: Role.client,
      email: 'new@client.com',
    };
    // First findUnique (before the self-heal branch) sees no row yet; the
    // upsert then loses the create race to a concurrent request instead of
    // transparently falling through to its update half (see the guard's
    // comment on why: pgbouncer transaction pooling breaks that
    // atomicity); the second findUnique (inside the P2002 recovery) picks
    // up the row the other request just created.
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(wonByOtherRequest);
    prisma.user.upsert.mockRejectedValue(uniqueConstraintError());
    const request = {
      headers: { authorization: 'Bearer t' },
      cookies: {},
    } as any;
    const { g, context } = contextFor(request);

    await expect(g.canActivate(context)).resolves.toBe(true);

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    expect(request.user).toBe(wonByOtherRequest);
  });

  it('still rejects if the create race is lost but the row is somehow not found on re-fetch', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'clerk-1', sid: 'sess_1' });
    getUserMock.mockResolvedValue({
      id: 'clerk-1',
      primaryEmailAddressId: 'em1',
      emailAddresses: [{ id: 'em1', emailAddress: 'new@client.com' }],
      firstName: 'New',
      lastName: 'Client',
      phoneNumbers: [],
      unsafeMetadata: {},
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.upsert.mockRejectedValue(uniqueConstraintError());
    const { g, context } = contextFor({
      headers: { authorization: 'Bearer t' },
      cookies: {},
    });

    await expect(g.canActivate(context)).rejects.toThrow();
  });

  it('propagates a non-P2002 upsert failure instead of swallowing it', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'clerk-1', sid: 'sess_1' });
    getUserMock.mockResolvedValue({
      id: 'clerk-1',
      primaryEmailAddressId: 'em1',
      emailAddresses: [{ id: 'em1', emailAddress: 'new@client.com' }],
      firstName: 'New',
      lastName: 'Client',
      phoneNumbers: [],
      unsafeMetadata: {},
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.upsert.mockRejectedValue(new Error('database is on fire'));
    const { g, context } = contextFor({
      headers: { authorization: 'Bearer t' },
      cookies: {},
    });

    await expect(g.canActivate(context)).rejects.toThrow('database is on fire');
  });

  it('rejects self-heal provisioning when the Clerk account has no primary email', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'clerk-1', sid: 'sess_1' });
    prisma.user.findUnique.mockResolvedValue(null);
    getUserMock.mockResolvedValue({
      id: 'clerk-1',
      primaryEmailAddressId: 'em1',
      emailAddresses: [],
    });
    const { g, context } = contextFor({
      headers: { authorization: 'Bearer t' },
      cookies: {},
    });

    await expect(g.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });
});
