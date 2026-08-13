import { Controller, Get, Query } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../generated/prisma';

@Roles(Role.admin)
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  search(@Query('q') q?: string, @Query('actorUserId') actorUserId?: string, @Query('action') action?: string) {
    return this.auditLog.search({ q, actorUserId, action });
  }
}
