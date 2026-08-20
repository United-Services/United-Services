import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LibreTranslateClient, chunkText } from './libretranslate.client';
import type {
  OpenPosition,
  Service,
  TranslatableContentType,
  TranslationStatus,
} from '../generated/prisma';

const POSITION_FIELDS = ['title', 'description', 'department'] as const;
type PositionField = (typeof POSITION_FIELDS)[number];

// name/shortDescription/longDescription only — never `specs`, which is
// technical standard codes (e.g. "API 15CLT Compliant", "DN50 – DN600")
// that must stay as-is (untranslated, in their original form) in every
// locale, not run through machine translation like marketing copy is.
const SERVICE_FIELDS = ['name', 'shortDescription', 'longDescription'] as const;
type ServiceField = (typeof SERVICE_FIELDS)[number];

export interface TranslatedPositionResult {
  status: TranslationStatus;
  title: string;
  description: string;
  department: string;
}

export interface TranslatedServiceResult {
  status: TranslationStatus;
  name: string;
  shortDescription: string;
  longDescription: string;
}

interface TranslatableItem {
  id: string;
}

// Everything translateAndStoreGeneric/getTranslatedContent/runTriggerGeneric
// need to know about a content type — the field list to translate, how to
// pull those fields off the actual entity, and the ContentTranslation row's
// discriminator. Adding a new translatable content type means adding one
// of these plus a thin public wrapper (see getTranslatedPositions /
// getTranslatedServices below), not touching the shared logic.
interface TranslationSpec<T extends TranslatableItem, F extends string> {
  contentType: TranslatableContentType;
  fields: readonly F[];
  extractFields: (item: T) => Record<F, string>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Cached machine translation for OpenPosition and Service content,
// self-hosted via LibreTranslate (see docker-compose.yml) — no per-
// character cost, so the "budget" here guards this container's own
// throughput, not an external bill. See docs/BUSINESS_RULES.md and the
// design writeup this module was built from for the full rationale.
@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly libreTranslate: LibreTranslateClient,
  ) {}

  // Stable across key order — sorts keys before stringifying — so the same
  // field values always hash identically regardless of how the object was
  // constructed.
  computeSourceHash(fields: Record<string, string>): string {
    const sorted = Object.keys(fields)
      .sort()
      .reduce<Record<string, string>>((acc, key) => {
        acc[key] = fields[key];
        return acc;
      }, {});
    return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
  }

  private lockKey(
    contentType: TranslatableContentType,
    contentId: string,
    locale: string,
  ): string {
    return `lock:translation:${contentType}:${contentId}:${locale}`;
  }

  private async acquireLock(
    contentType: TranslatableContentType,
    contentId: string,
    locale: string,
  ): Promise<boolean> {
    const ttl = Number(process.env.TRANSLATION_LOCK_TTL_MS ?? 30_000);
    const result = await this.redis.set(
      this.lockKey(contentType, contentId, locale),
      '1',
      'PX',
      ttl,
      'NX',
    );
    return result === 'OK';
  }

  private async releaseLock(
    contentType: TranslatableContentType,
    contentId: string,
    locale: string,
  ): Promise<void> {
    await this.redis.del(this.lockKey(contentType, contentId, locale));
  }

  private budgetKey(): string {
    return `translation:usage:${new Date().toISOString().slice(0, 7)}`;
  }

  // Throughput guard, not a cost cap (LibreTranslate is self-hosted, no
  // per-character bill) — protects this container from a request storm or
  // a runaway retry loop. Raise TRANSLATION_MONTHLY_CHAR_BUDGET freely.
  private async withinBudget(estimatedChars: number): Promise<boolean> {
    const used = Number((await this.redis.get(this.budgetKey())) ?? 0);
    const budget = Number(
      process.env.TRANSLATION_MONTHLY_CHAR_BUDGET ?? 2_000_000,
    );
    return used + estimatedChars <= budget;
  }

  private async recordUsage(chars: number): Promise<void> {
    await this.redis.incrby(this.budgetKey(), chars);
  }

  // Does the actual translation work for every item in `items` (caller
  // must already hold each one's lock) and always leaves every row in a
  // terminal status (translated/failed) — never throws, so a translation
  // failure can never break the request that triggered it.
  private async translateAndStoreGeneric<
    T extends TranslatableItem,
    F extends string,
  >(items: T[], locale: string, spec: TranslationSpec<T, F>): Promise<void> {
    if (items.length === 0) return;
    const { contentType, fields, extractFields } = spec;

    await Promise.all(
      items.map((item) =>
        this.prisma.contentTranslation.upsert({
          where: {
            contentType_contentId_locale: {
              contentType,
              contentId: item.id,
              locale,
            },
          },
          create: {
            contentType,
            contentId: item.id,
            locale,
            status: 'translating',
            fields: {},
            sourceHash: this.computeSourceHash(extractFields(item)),
          },
          update: { status: 'translating' },
        }),
      ),
    );

    type ChunkRef = { itemId: string; field: F; chunkIndex: number };
    const refs: ChunkRef[] = [];
    const texts: string[] = [];

    for (const item of items) {
      const itemFields = extractFields(item);
      for (const field of fields) {
        const chunks = chunkText(itemFields[field]);
        chunks.forEach((chunk, chunkIndex) => {
          refs.push({ itemId: item.id, field, chunkIndex });
          texts.push(chunk);
        });
      }
    }

    const estimatedChars = texts.reduce((sum, t) => sum + t.length, 0);
    if (!(await this.withinBudget(estimatedChars))) {
      await Promise.all(
        items.map((item) =>
          this.prisma.contentTranslation.update({
            where: {
              contentType_contentId_locale: {
                contentType,
                contentId: item.id,
                locale,
              },
            },
            data: {
              status: 'failed',
              errorMessage: 'monthly translation volume guard exceeded',
            },
          }),
        ),
      );
      await Promise.all(
        items.map((item) => this.releaseLock(contentType, item.id, locale)),
      );
      return;
    }

    try {
      const { translations, charCount } =
        await this.libreTranslate.translateBatch(texts, locale);
      await this.recordUsage(charCount);

      // Reassemble: group each item+field's chunk translations back in
      // order, then join into the final translated field value.
      const grouped = new Map<string, string[]>();
      refs.forEach((ref, i) => {
        const key = `${ref.itemId}:${ref.field}`;
        const arr = grouped.get(key) ?? [];
        arr[ref.chunkIndex] = translations[i];
        grouped.set(key, arr);
      });

      await Promise.all(
        items.map((item) => {
          const translatedFields = Object.fromEntries(
            fields.map((field) => [
              field,
              (grouped.get(`${item.id}:${field}`) ?? []).join('\n\n'),
            ]),
          );
          return this.prisma.contentTranslation.update({
            where: {
              contentType_contentId_locale: {
                contentType,
                contentId: item.id,
                locale,
              },
            },
            data: {
              status: 'translated',
              fields: translatedFields,
              sourceHash: this.computeSourceHash(extractFields(item)),
              translatedAt: new Date(),
              errorMessage: null,
            },
          });
        }),
      );
    } catch (error) {
      const message = (error as Error).message ?? 'Unknown translation error';
      this.logger.error(
        `Translation failed for locale=${locale}, contentType=${contentType}, items=${items.map((i) => i.id).join(',')}: ${message}`,
      );
      await Promise.all(
        items.map((item) =>
          this.prisma.contentTranslation.update({
            where: {
              contentType_contentId_locale: {
                contentType,
                contentId: item.id,
                locale,
              },
            },
            data: { status: 'failed', errorMessage: message.slice(0, 500) },
          }),
        ),
      );
    } finally {
      await Promise.all(
        items.map((item) => this.releaseLock(contentType, item.id, locale)),
      );
    }
  }

  // The read path: for each item, returns cached content if the hash
  // still matches, otherwise triggers (and, for items this call wins the
  // lock for, waits out) a fresh translation — bounded so a visitor is
  // never blocked waiting on the translation service indefinitely.
  private async getTranslatedContent<
    T extends TranslatableItem,
    F extends string,
  >(
    items: T[],
    locale: string,
    spec: TranslationSpec<T, F>,
  ): Promise<Map<string, { status: TranslationStatus } & Record<F, string>>> {
    const { contentType, extractFields } = spec;
    const result = new Map<
      string,
      { status: TranslationStatus } & Record<F, string>
    >();
    if (items.length === 0) return result;

    const asOriginal = (
      item: T,
    ): { status: TranslationStatus } & Record<F, string> => ({
      status: 'missing',
      ...extractFields(item),
    });

    const ids = items.map((item) => item.id);
    const existingRows = await this.prisma.contentTranslation.findMany({
      where: { contentType, contentId: { in: ids }, locale },
    });
    const existingById = new Map(existingRows.map((r) => [r.contentId, r]));

    const needsTranslation: T[] = [];
    for (const item of items) {
      const hash = this.computeSourceHash(extractFields(item));
      const row = existingById.get(item.id);
      if (row && row.status === 'translated' && row.sourceHash === hash) {
        const fields = row.fields as Record<F, string>;
        result.set(item.id, { status: 'translated', ...fields });
      } else {
        needsTranslation.push(item);
      }
    }
    if (needsTranslation.length === 0) return result;

    const lockResults = await Promise.all(
      needsTranslation.map(async (item) => ({
        item,
        acquired: await this.acquireLock(contentType, item.id, locale),
      })),
    );
    const toTranslateNow = lockResults
      .filter((r) => r.acquired)
      .map((r) => r.item);
    const waitingForOthers = lockResults
      .filter((r) => !r.acquired)
      .map((r) => r.item);

    if (toTranslateNow.length > 0) {
      await this.translateAndStoreGeneric(toTranslateNow, locale, spec);
      const finalRows = await this.prisma.contentTranslation.findMany({
        where: {
          contentType,
          contentId: { in: toTranslateNow.map((item) => item.id) },
          locale,
        },
      });
      const finalById = new Map(finalRows.map((r) => [r.contentId, r]));
      for (const item of toTranslateNow) {
        const row = finalById.get(item.id);
        if (row?.status === 'translated') {
          const fields = row.fields as Record<F, string>;
          result.set(item.id, { status: 'translated', ...fields });
        } else {
          result.set(item.id, {
            status: row?.status ?? 'failed',
            ...extractFields(item),
          });
        }
      }
    }

    if (waitingForOthers.length > 0) {
      const waitMs = Number(process.env.TRANSLATION_SYNC_WAIT_MS ?? 2500);
      await Promise.all(
        waitingForOthers.map(async (item) => {
          const hash = this.computeSourceHash(extractFields(item));
          const deadline = Date.now() + waitMs;
          while (Date.now() < deadline) {
            const row = await this.prisma.contentTranslation.findUnique({
              where: {
                contentType_contentId_locale: {
                  contentType,
                  contentId: item.id,
                  locale,
                },
              },
            });
            if (row?.status === 'translated' && row.sourceHash === hash) {
              const fields = row.fields as Record<F, string>;
              result.set(item.id, { status: 'translated', ...fields });
              return;
            }
            if (row?.status === 'failed') {
              result.set(item.id, { status: 'failed', ...extractFields(item) });
              return;
            }
            await sleep(300);
          }
          // Timed out — never block the caller indefinitely. The
          // translation is presumably still in flight elsewhere.
          result.set(item.id, {
            status: 'translating',
            ...extractFields(item),
          });
        }),
      );
    }

    // Anything not otherwise set (e.g. malformed cached rows this call
    // never touched) falls back to the original content rather than being
    // silently absent from the map.
    for (const item of items) {
      if (!result.has(item.id)) result.set(item.id, asOriginal(item));
    }

    return result;
  }

  private async runTriggerGeneric<T extends TranslatableItem, F extends string>(
    item: T,
    locale: string,
    spec: TranslationSpec<T, F>,
  ): Promise<void> {
    const { contentType, extractFields } = spec;
    const hash = this.computeSourceHash(extractFields(item));
    const existing = await this.prisma.contentTranslation.findUnique({
      where: {
        contentType_contentId_locale: {
          contentType,
          contentId: item.id,
          locale,
        },
      },
    });
    if (existing?.status === 'translated' && existing.sourceHash === hash)
      return;

    const acquired = await this.acquireLock(contentType, item.id, locale);
    if (!acquired) return; // another request (e.g. a concurrent GET) is already handling it

    await this.translateAndStoreGeneric([item], locale, spec);
  }

  // Arrow-function class fields (not methods) — passed by reference into
  // TranslationSpec.extractFields elsewhere in this file, and neither one
  // touches `this`, so this form avoids a false-positive unbound-method
  // lint warning a plain method would trigger there.
  private positionFields = (
    position: OpenPosition,
  ): Record<PositionField, string> => ({
    title: position.title,
    description: position.description,
    department: position.department,
  });

  private serviceFields = (service: Service): Record<ServiceField, string> => ({
    name: service.name,
    shortDescription: service.shortDescription,
    longDescription: service.longDescription,
  });

  private positionSpec(): TranslationSpec<OpenPosition, PositionField> {
    return {
      contentType: 'open_position',
      fields: POSITION_FIELDS,
      extractFields: this.positionFields,
    };
  }

  private serviceSpec(): TranslationSpec<Service, ServiceField> {
    return {
      contentType: 'service',
      fields: SERVICE_FIELDS,
      extractFields: this.serviceFields,
    };
  }

  async getTranslatedPositions(
    positions: OpenPosition[],
    locale: string,
  ): Promise<Map<string, TranslatedPositionResult>> {
    return this.getTranslatedContent(positions, locale, this.positionSpec());
  }

  async getTranslatedServices(
    services: Service[],
    locale: string,
  ): Promise<Map<string, TranslatedServiceResult>> {
    return this.getTranslatedContent(services, locale, this.serviceSpec());
  }

  // Fire-and-forget publish-time hook — NOT awaited by the caller.
  // Wrapped so a failure here can never surface as an unhandled rejection.
  triggerAsync(position: OpenPosition, locales: string[]): void {
    for (const locale of locales) {
      this.runTriggerGeneric(position, locale, this.positionSpec()).catch(
        (error: Error) => {
          this.logger.error(
            `triggerAsync failed for position=${position.id} locale=${locale}: ${error.message}`,
          );
        },
      );
    }
  }

  triggerServiceAsync(service: Service, locales: string[]): void {
    for (const locale of locales) {
      this.runTriggerGeneric(service, locale, this.serviceSpec()).catch(
        (error: Error) => {
          this.logger.error(
            `triggerServiceAsync failed for service=${service.id} locale=${locale}: ${error.message}`,
          );
        },
      );
    }
  }

  async invalidate(
    contentType: TranslatableContentType,
    contentId: string,
    locale: string,
  ): Promise<void> {
    await this.prisma.contentTranslation.updateMany({
      where: { contentType, contentId, locale },
      data: {
        status: 'missing',
        fields: {},
        errorMessage: null,
        translatedAt: null,
      },
    });
  }
}
