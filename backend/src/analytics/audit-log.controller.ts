import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Roles } from '../common/decorators/roles.decorator';
import { DEFAULT_PAGE_SIZE } from '../common/utils/paginate';
import { Role } from '../generated/prisma';

// Exclusively super_admin — NOT ADMIN_ROLES/Role.admin. This is one of the
// two features (see TicketsController for the other) deliberately kept
// out of a regular admin's reach.
@Roles(Role.super_admin)
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  search(
    @Query('q') q?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('action') action?: string,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip = 0,
    @Query('take', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    take = DEFAULT_PAGE_SIZE,
  ) {
    return this.auditLog.search({ q, actorUserId, action, skip, take });
  }
}
