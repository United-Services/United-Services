import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

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

    const request = context.switchToHttp().getRequest();
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

    const user = await this.prisma.user.findUnique({ where: { clerkId } });
    if (!user || user.disabledAt) {
      throw new UnauthorizedException('Account not found or disabled');
    }

    request.user = user;
    return true;
  }

  private extractToken(request: any): string | undefined {
    const cookieToken = request.cookies?.__session;
    if (cookieToken) return cookieToken;

    const authHeader = request.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice('Bearer '.length);

    return undefined;
  }
}
