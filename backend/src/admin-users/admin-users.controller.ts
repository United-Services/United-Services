import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { createClerkClient } from '@clerk/backend';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { generateTempPassword } from '../common/utils/generate-temp-password';
import { fuzzyMatch, searchableText } from '../common/utils/fuzzy-match';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { Role, Prisma, type User } from '../generated/prisma';

@Roles(Role.admin)
@Controller('admin/users')
export class AdminUsersController {
  private readonly clerkClient = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // Creates the account in Clerk first (source of truth for sign-in), then
  // mirrors it into our own User table directly rather than waiting on the
  // user.created webhook — same self-heal reasoning as ClerkAuthGuard: no
  // ordering guarantee on webhook delivery, and this admin-facing response
  // needs the row to exist (with mustChangePassword set) before it returns.
  // If the webhook still lands afterward, its upsert only ever touches
  // email/firstName/lastName/phone on the update branch (see
  // ClerkWebhookController) — role and mustChangePassword are untouched,
  // so no race can silently revert either.
  @Post()
  async create(@CurrentUser() admin: User, @Body() dto: CreateUserDto) {
    const tempPassword = generateTempPassword();

    let clerkUser: Awaited<
      ReturnType<typeof this.clerkClient.users.createUser>
    >;
    try {
      clerkUser = await this.clerkClient.users.createUser({
        emailAddress: [dto.email],
        password: tempPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        publicMetadata: { role: dto.role },
      });
    } catch {
      throw new ConflictException(
        'Could not create this account in Clerk — the email may already be in use',
      );
    }

    let user: Awaited<ReturnType<typeof this.prisma.user.create>>;
    try {
      user = await this.prisma.user.create({
        data: {
          clerkId: clerkUser.id,
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role,
          companyName: dto.companyName,
          phone: dto.phone,
          mustChangePassword: true,
        },
      });
    } catch (error) {
      // Local row failed (e.g. email already used by a different, out-of-
      // sync local row) after the Clerk account was already created —
      // clean up rather than leave an orphaned Clerk user with no local
      // counterpart, which ClerkAuthGuard's self-heal would otherwise
      // silently paper over as a 'client' on first sign-in regardless of
      // the role picked here.
      await this.clerkClient.users
        .deleteUser(clerkUser.id)
        .catch(() => undefined);
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }

    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'user.created_by_admin',
      targetType: 'User',
      targetId: user.id,
      metadata: { role: dto.role, email: dto.email },
    });

    return {
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      tempPassword,
    };
  }

  // Fuzzy-matched in-app rather than via a SQL `contains` — see
  // fuzzy-match.ts. This table is admin-panel scale (companies/staff, not
  // end users), so filtering the role-scoped result set in memory is
  // cheap and lets a typo'd or partial query ("jsmth") still find "John
  // Smith" the way a substring match never could.
  @Get()
  async list(@Query('q') q?: string, @Query('role') role?: Role) {
    const users = await this.prisma.user.findMany({
      where: role ? { role } : {},
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        role: true,
        email: true,
        firstName: true,
        lastName: true,
        companyName: true,
        mfaEnrolled: true,
        mustChangePassword: true,
        createdAt: true,
        disabledAt: true,
      },
    });
    if (!q) return users;
    return users.filter((u) =>
      fuzzyMatch(
        searchableText(u.firstName, u.lastName, u.email, u.companyName),
        q,
      ),
    );
  }

  @Patch(':id/disable')
  async disable(@CurrentUser() admin: User, @Param('id') id: string) {
    if (id === admin.id)
      throw new BadRequestException('You cannot disable your own account');
    const updated = await this.prisma.user.update({
      where: { id },
      data: { disabledAt: new Date() },
    });
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'user.disabled',
      targetType: 'User',
      targetId: id,
    });
    return updated;
  }

  @Patch(':id/enable')
  async enable(@CurrentUser() admin: User, @Param('id') id: string) {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { disabledAt: null },
    });
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'user.enabled',
      targetType: 'User',
      targetId: id,
    });
    return updated;
  }

  // Mirrors the change into Clerk's publicMetadata too — our own User.role
  // stays the sole source of truth every authorization check re-reads
  // (ClerkWebhookController's update branch never touches role, so this is
  // the only path a role can ever change through post-creation), but
  // keeping Clerk's copy in sync avoids the two silently diverging if
  // anything ever reads it from there in the future. See
  // docs/BUSINESS_RULES.md rule 6 — admins cannot change their own role.
  @Patch(':id/role')
  async updateRole(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    if (id === admin.id)
      throw new BadRequestException('You cannot change your own role');

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
    });
    await this.clerkClient.users
      .updateUser(target.clerkId, { publicMetadata: { role: dto.role } })
      .catch(() => undefined); // best-effort mirror — our own DB already committed and is what every guard reads

    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'user.role_changed',
      targetType: 'User',
      targetId: id,
      metadata: { oldRole: target.role, newRole: dto.role },
    });
    return updated;
  }

  // Distinct from POST /mfa/admin-password-reset (mfa.controller.ts),
  // which is an *admin resetting their own* password behind a fresh MFA
  // re-verification (docs/BUSINESS_RULES.md rule 7). This is an admin
  // resetting *someone else's* — no MFA re-verification of the target
  // makes sense here since it's not their own session. The temp password
  // is returned once and never stored; mustChangePassword forces them to
  // pick a real one on next sign-in.
  @Post(':id/reset-password')
  async resetPassword(@CurrentUser() admin: User, @Param('id') id: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    const tempPassword = generateTempPassword();

    await this.clerkClient.users.updateUser(target.clerkId, {
      password: tempPassword,
      signOutOfOtherSessions: true,
    });
    await this.prisma.user.update({
      where: { id },
      data: { mustChangePassword: true },
    });

    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'user.password_reset_by_admin',
      targetType: 'User',
      targetId: id,
    });
    return { tempPassword };
  }
}
