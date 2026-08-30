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
