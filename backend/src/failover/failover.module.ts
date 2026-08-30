import { Global, Module } from '@nestjs/common';
import { FailoverService } from './failover.service';
import { DbMirrorSyncService } from './db-mirror-sync.service';
import { DbMirrorSyncWorker } from './db-mirror-sync.worker';
import { FailoverReconciliationService } from './failover-reconciliation.service';
import { FailoverReconciliationWorker } from './failover-reconciliation.worker';

// @Global so PrismaService/RedisService/queue.module.ts can inject
// FailoverService without importing this module — same convention as
// RedisModule/AuditLogModule/QueueModule. DbMirrorSyncWorker/
// FailoverReconciliationWorker inject DB_MIRROR_SYNC_QUEUE/
// FAILOVER_RECONCILE_QUEUE etc. from QueueModule without an explicit
// `imports: [QueueModule]` here — QueueModule is itself @Global (and
// already imports FailoverModule for FailoverService), so adding the
// reverse edge here would create a circular module import for no
// benefit; global-module export visibility already covers it, same
// pattern AuditLogModule already relies on for AuditLogArchiveWorker.
@Global()
@Module({
  providers: [
    FailoverService,
    DbMirrorSyncService,
    DbMirrorSyncWorker,
    FailoverReconciliationService,
    FailoverReconciliationWorker,
  ],
  exports: [FailoverService],
})
export class FailoverModule {}
