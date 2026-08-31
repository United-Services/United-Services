// DI tokens for the BullMQ Queue instances — kept separate from
// queue.module.ts so any module can import just the token (for
// @Inject(...)) without pulling in the provider/connection setup itself.
export const TRANSLATION_QUEUE = 'TRANSLATION_QUEUE';
export const TRANSLATION_DLQ = 'TRANSLATION_DLQ';

export const TRANSLATION_QUEUE_NAME = 'translations';
export const TRANSLATION_DLQ_NAME = 'translations-dlq';

// Shape of a translation job's payload/DLQ entry — one (content row,
// locale) pair per job, matching how triggerAsync/triggerServiceAsync
// already fan out one call per locale.
export interface TranslationJobData {
  contentType: 'open_position' | 'service';
  contentId: string;
  locale: string;
}

export const AUDIT_ARCHIVE_QUEUE = 'AUDIT_ARCHIVE_QUEUE';
export const AUDIT_ARCHIVE_DLQ = 'AUDIT_ARCHIVE_DLQ';

export const AUDIT_ARCHIVE_QUEUE_NAME = 'audit-log-archive';
export const AUDIT_ARCHIVE_DLQ_NAME = 'audit-log-archive-dlq';

// One repeating job (see AuditLogArchiveWorker's registerRepeatableJob) —
// data is intentionally empty. The cutoff (now - 90 days) is computed
// fresh inside AuditLogArchiveService on every run, not baked into the
// job payload at schedule-registration time, so a job that sits in the
// queue for a while (or gets retried) always archives against "90 days
// before it actually runs," never a stale cutoff from when it was
// enqueued.
export type AuditArchiveJobData = Record<string, never>;

export const DB_MIRROR_SYNC_QUEUE = 'DB_MIRROR_SYNC_QUEUE';
export const DB_MIRROR_SYNC_DLQ = 'DB_MIRROR_SYNC_DLQ';

export const DB_MIRROR_SYNC_QUEUE_NAME = 'db-mirror-sync';
export const DB_MIRROR_SYNC_DLQ_NAME = 'db-mirror-sync-dlq';

// Empty for the same reason as AuditArchiveJobData — DbMirrorSyncService
// always syncs against Postgres's current state, never a snapshot from
// when the job was scheduled.
export type DbMirrorSyncJobData = Record<string, never>;

export const FAILOVER_RECONCILE_QUEUE = 'FAILOVER_RECONCILE_QUEUE';
export const FAILOVER_RECONCILE_DLQ = 'FAILOVER_RECONCILE_DLQ';

export const FAILOVER_RECONCILE_QUEUE_NAME = 'failover-reconcile';
export const FAILOVER_RECONCILE_DLQ_NAME = 'failover-reconcile-dlq';

export type FailoverReconcileJobData = Record<string, never>;

export const TICKET_ARCHIVE_QUEUE = 'TICKET_ARCHIVE_QUEUE';
export const TICKET_ARCHIVE_DLQ = 'TICKET_ARCHIVE_DLQ';

export const TICKET_ARCHIVE_QUEUE_NAME = 'ticket-archive';
export const TICKET_ARCHIVE_DLQ_NAME = 'ticket-archive-dlq';

// One job per resolved ticket (enqueued the moment TicketsController.
// updateStatus() transitions a ticket to resolved) plus a periodic
// catch-up sweep with the same empty-data shape — see
// TicketArchiveWorker's two triggers.
export interface TicketArchiveJobData {
  ticketId?: string;
}
