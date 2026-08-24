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
