import { BadRequestException, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, type User } from '../generated/prisma';

@Roles(Role.admin)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get()
  list(@Query('q') q?: string, @Query('role') role?: Role) {
    return this.prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { companyName: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        role: true,
        email: true,
        firstName: true,
        lastName: true,
        companyName: true,
        mfaEnrolled: true,
        createdAt: true,
        disabledAt: true,
      },
    });
  }

  @Patch(':id/disable')
  async disable(@CurrentUser() admin: User, @Param('id') id: string) {
    if (id === admin.id) throw new BadRequestException('You cannot disable your own account');
    const updated = await this.prisma.user.update({ where: { id }, data: { disabledAt: new Date() } });
    await this.auditLog.record({ actorUserId: admin.id, action: 'user.disabled', targetType: 'User', targetId: id });
    return updated;
  }

  @Patch(':id/enable')
  async enable(@CurrentUser() admin: User, @Param('id') id: string) {
    const updated = await this.prisma.user.update({ where: { id }, data: { disabledAt: null } });
    await this.auditLog.record({ actorUserId: admin.id, action: 'user.enabled', targetType: 'User', targetId: id });
    return updated;
  }
}
