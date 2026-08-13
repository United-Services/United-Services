import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '../generated/prisma';

// The only source of truth the frontend's post-sign-in redirect relies on —
// req.user was populated by ClerkAuthGuard from our own User table, not a
// raw Clerk claim, so this genuinely re-checks the DB on every call. See
// docs/BUSINESS_RULES.md.
@Controller('me')
export class MeController {
  @Get()
  me(@CurrentUser() user: User) {
    return {
      id: user.id,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      companyName: user.companyName,
      mfaEnrolled: user.mfaEnrolled,
    };
  }
}
