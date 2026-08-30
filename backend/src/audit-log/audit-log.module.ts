import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditLogArchiveService } from './audit-log-archive.service';
import { AuditLogArchiveWorker } from './audit-log-archive.worker';

@Global()
@Module({
  providers: [AuditLogService, AuditLogArchiveService, AuditLogArchiveWorker],
  exports: [AuditLogService, AuditLogArchiveService],
})
export class AuditLogModule {}
