import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Role, Prisma, type User } from '../generated/prisma';

type AuthedRequest = Request & { user?: User };

// Verifies the Clerk session cookie/token on every request and attaches the
// corresponding local User row (never a raw Clerk claim) to req.user, so
// every downstream authorization check re-verifies against our own DB —
// per BUSINESS_RULES.md: "never trust a role claim without re-checking your
// own DB".
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly clerkClient = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  });

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing session token');

    let clerkId: string;
    try {
      const verified = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      clerkId = verified.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }

    let user = await this.prisma.user.findUnique({ where: { clerkId } });

    // The very first authenticated request right after sign-up can beat the
    // async user.created webhook (Clerk delivers it out-of-band, no
    // ordering guarantee against the client's own next request). Self-heal
    // by provisioning the row here instead of failing — always as the safe
    // default role; only the webhook (reading server-set publicMetadata)
    // ever assigns 'admin'.
    if (!user) {
      const clerkUser = await this.clerkClient.users.getUser(clerkId);
      const primaryEmail = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress;
      if (!primaryEmail)
        throw new UnauthorizedException('Clerk account has no primary email');

      const unsafeMetadata = clerkUser.unsafeMetadata as
        { companyName?: string; phone?: string } | undefined;
      try {
        user = await this.prisma.user.upsert({
          where: { clerkId },
          update: {},
          create: {
            clerkId,
            email: primaryEmail,
            firstName: clerkUser.firstName ?? '',
            lastName: clerkUser.lastName ?? '',
            phone:
              clerkUser.phoneNumbers?.[0]?.phoneNumber ?? unsafeMetadata?.phone,
            companyName: unsafeMetadata?.companyName,
            role: Role.client,
          },
        });
      } catch (error) {
        // Two of a newly-signed-up user's first authenticated requests can
        // both land here concurrently (e.g. a dashboard firing several
        // requests in parallel right after redirect) — both find no row,
        // both race to create one. Whichever loses the race hits a unique
        // constraint violation on the *insert half* of this upsert rather
        // than transparently falling through to the update half — that's
        // not this app being wrong, it's Prisma's upsert losing its usual
        // atomicity guarantee over a transaction-pooled connection
        // (Supabase's pgbouncer), which doesn't preserve the session state
        // Prisma's upsert compilation normally relies on. Whoever won the
        // race already created the row, so just fetch it instead of
        // failing the request.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          user = await this.prisma.user.findUnique({ where: { clerkId } });
          if (!user) throw error;
        } else {
          throw error;
        }
      }
    }

    if (user.disabledAt) {
      throw new UnauthorizedException('Account not found or disabled');
    }

    request.user = user;
    return true;
  }

  private extractToken(request: AuthedRequest): string | undefined {
    const cookieToken = request.cookies?.__session as string | undefined;
    if (cookieToken) return cookieToken;

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer '))
      return authHeader.slice('Bearer '.length);

    return undefined;
  }
}
