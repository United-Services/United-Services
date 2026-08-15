import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LibreTranslateClient, chunkText } from './libretranslate.client';
import type {
  OpenPosition,
  TranslatableContentType,
  TranslationStatus,
} from '../generated/prisma';

const TRANSLATABLE_FIELDS = ['title', 'description', 'department'] as const;
type TranslatableField = (typeof TRANSLATABLE_FIELDS)[number];

export interface TranslatedPositionResult {
  status: TranslationStatus;
  title: string;
  description: string;
  department: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Cached machine translation for OpenPosition content, self-hosted via
// LibreTranslate (see docker-compose.yml) — no per-character cost, so the
// "budget" here guards this container's own throughput, not an external
// bill. See docs/BUSINESS_RULES.md and the design writeup this module was
// built from for the full rationale.
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

  private sourceFields(
    position: OpenPosition,
  ): Record<TranslatableField, string> {
    return {
      title: position.title,
      description: position.description,
      department: position.department,
    };
  }

  private lockKey(contentId: string, locale: string): string {
    return `lock:translation:open_position:${contentId}:${locale}`;
  }

  private async acquireLock(
    contentId: string,
    locale: string,
  ): Promise<boolean> {
    const ttl = Number(process.env.TRANSLATION_LOCK_TTL_MS ?? 30_000);
    const result = await this.redis.set(
      this.lockKey(contentId, locale),
      '1',
      'PX',
      ttl,
      'NX',
    );
    return result === 'OK';
  }

  private async releaseLock(contentId: string, locale: string): Promise<void> {
    await this.redis.del(this.lockKey(contentId, locale));
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

  // Does the actual translation work for every position in `positions`
  // (caller must already hold each one's lock) and always leaves every
  // row in a terminal status (translated/failed) — never throws, so a
  // translation failure can never break the request that triggered it.
  private async translateAndStore(
    positions: OpenPosition[],
    locale: string,
  ): Promise<void> {
    if (positions.length === 0) return;

    await Promise.all(
      positions.map((p) =>
        this.prisma.contentTranslation.upsert({
          where: {
            contentType_contentId_locale: {
              contentType: 'open_position',
              contentId: p.id,
              locale,
            },
          },
          create: {
            contentType: 'open_position',
            contentId: p.id,
            locale,
            status: 'translating',
            fields: {},
            sourceHash: this.computeSourceHash(this.sourceFields(p)),
          },
          update: { status: 'translating' },
        }),
      ),
    );

    type ChunkRef = {
      positionId: string;
      field: TranslatableField;
      chunkIndex: number;
    };
    const refs: ChunkRef[] = [];
    const texts: string[] = [];

    for (const p of positions) {
      const fields = this.sourceFields(p);
      for (const field of TRANSLATABLE_FIELDS) {
        const chunks = chunkText(fields[field]);
        chunks.forEach((chunk, chunkIndex) => {
          refs.push({ positionId: p.id, field, chunkIndex });
          texts.push(chunk);
        });
      }
    }

    const estimatedChars = texts.reduce((sum, t) => sum + t.length, 0);
    if (!(await this.withinBudget(estimatedChars))) {
      await Promise.all(
        positions.map((p) =>
          this.prisma.contentTranslation.update({
            where: {
              contentType_contentId_locale: {
                contentType: 'open_position',
                contentId: p.id,
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
      await Promise.all(positions.map((p) => this.releaseLock(p.id, locale)));
      return;
    }

    try {
      const { translations, charCount } =
        await this.libreTranslate.translateBatch(texts, locale);
      await this.recordUsage(charCount);

      // Reassemble: group each position+field's chunk translations back
      // in order, then join into the final translated field value.
      const grouped = new Map<string, string[]>();
      refs.forEach((ref, i) => {
        const key = `${ref.positionId}:${ref.field}`;
        const arr = grouped.get(key) ?? [];
        arr[ref.chunkIndex] = translations[i];
        grouped.set(key, arr);
      });

      await Promise.all(
        positions.map((p) => {
          const translatedFields: Record<TranslatableField, string> = {
            title: (grouped.get(`${p.id}:title`) ?? []).join('\n\n'),
            description: (grouped.get(`${p.id}:description`) ?? []).join(
              '\n\n',
            ),
            department: (grouped.get(`${p.id}:department`) ?? []).join('\n\n'),
          };
          return this.prisma.contentTranslation.update({
            where: {
              contentType_contentId_locale: {
                contentType: 'open_position',
                contentId: p.id,
                locale,
              },
            },
            data: {
              status: 'translated',
              fields: translatedFields,
              sourceHash: this.computeSourceHash(this.sourceFields(p)),
              translatedAt: new Date(),
              errorMessage: null,
            },
          });
        }),
      );
    } catch (error) {
      const message = (error as Error).message ?? 'Unknown translation error';
      this.logger.error(
        `Translation failed for locale=${locale}, positions=${positions.map((p) => p.id).join(',')}: ${message}`,
      );
      await Promise.all(
        positions.map((p) =>
          this.prisma.contentTranslation.update({
            where: {
              contentType_contentId_locale: {
                contentType: 'open_position',
                contentId: p.id,
                locale,
              },
            },
            data: { status: 'failed', errorMessage: message.slice(0, 500) },
          }),
        ),
      );
    } finally {
      await Promise.all(positions.map((p) => this.releaseLock(p.id, locale)));
    }
  }

  // The read path: for each position, returns cached content if the hash
  // still matches, otherwise triggers (and, for positions this call wins
  // the lock for, waits out) a fresh translation — bounded so a visitor
  // is never blocked waiting on the translation service indefinitely.
  async getTranslatedPositions(
    positions: OpenPosition[],
    locale: string,
  ): Promise<Map<string, TranslatedPositionResult>> {
    const result = new Map<string, TranslatedPositionResult>();
    if (positions.length === 0) return result;

    const ids = positions.map((p) => p.id);
    const existingRows = await this.prisma.contentTranslation.findMany({
      where: { contentType: 'open_position', contentId: { in: ids }, locale },
    });
    const existingByPositionId = new Map(
      existingRows.map((r) => [r.contentId, r]),
    );

    const needsTranslation: OpenPosition[] = [];
    for (const p of positions) {
      const hash = this.computeSourceHash(this.sourceFields(p));
      const row = existingByPositionId.get(p.id);
      if (row && row.status === 'translated' && row.sourceHash === hash) {
        const fields = row.fields as Record<TranslatableField, string>;
        result.set(p.id, {
          status: 'translated',
          title: fields.title,
          description: fields.description,
          department: fields.department,
        });
      } else {
        needsTranslation.push(p);
      }
    }
    if (needsTranslation.length === 0) return result;

    const lockResults = await Promise.all(
      needsTranslation.map(async (p) => ({
        position: p,
        acquired: await this.acquireLock(p.id, locale),
      })),
    );
    const toTranslateNow = lockResults
      .filter((r) => r.acquired)
      .map((r) => r.position);
    const waitingForOthers = lockResults
      .filter((r) => !r.acquired)
      .map((r) => r.position);

    if (toTranslateNow.length > 0) {
      await this.translateAndStore(toTranslateNow, locale);
      const finalRows = await this.prisma.contentTranslation.findMany({
        where: {
          contentType: 'open_position',
          contentId: { in: toTranslateNow.map((p) => p.id) },
          locale,
        },
      });
      const finalByPositionId = new Map(finalRows.map((r) => [r.contentId, r]));
      for (const p of toTranslateNow) {
        const row = finalByPositionId.get(p.id);
        if (row?.status === 'translated') {
          const fields = row.fields as Record<TranslatableField, string>;
          result.set(p.id, {
            status: 'translated',
            title: fields.title,
            description: fields.description,
            department: fields.department,
          });
        } else {
          result.set(p.id, {
            status: row?.status ?? 'failed',
            title: p.title,
            description: p.description,
            department: p.department,
          });
        }
      }
    }

    if (waitingForOthers.length > 0) {
      const waitMs = Number(process.env.TRANSLATION_SYNC_WAIT_MS ?? 2500);
      await Promise.all(
        waitingForOthers.map(async (p) => {
          const hash = this.computeSourceHash(this.sourceFields(p));
          const deadline = Date.now() + waitMs;
          while (Date.now() < deadline) {
            const row = await this.prisma.contentTranslation.findUnique({
              where: {
                contentType_contentId_locale: {
                  contentType: 'open_position',
                  contentId: p.id,
                  locale,
                },
              },
            });
            if (row?.status === 'translated' && row.sourceHash === hash) {
              const fields = row.fields as Record<TranslatableField, string>;
              result.set(p.id, {
                status: 'translated',
                title: fields.title,
                description: fields.description,
                department: fields.department,
              });
              return;
            }
            if (row?.status === 'failed') {
              result.set(p.id, {
                status: 'failed',
                title: p.title,
                description: p.description,
                department: p.department,
              });
              return;
            }
            await sleep(300);
          }
          // Timed out — never block the caller indefinitely. The
          // translation is presumably still in flight elsewhere.
          result.set(p.id, {
            status: 'translating',
            title: p.title,
            description: p.description,
            department: p.department,
          });
        }),
      );
    }

    return result;
  }

  // Fire-and-forget publish-time hook — NOT awaited by the caller.
  // Wrapped so a failure here can never surface as an unhandled rejection.
  triggerAsync(position: OpenPosition, locales: string[]): void {
    for (const locale of locales) {
      this.runTrigger(position, locale).catch((error: Error) => {
        this.logger.error(
          `triggerAsync failed for position=${position.id} locale=${locale}: ${error.message}`,
        );
      });
    }
  }

  private async runTrigger(
    position: OpenPosition,
    locale: string,
  ): Promise<void> {
    const hash = this.computeSourceHash(this.sourceFields(position));
    const existing = await this.prisma.contentTranslation.findUnique({
      where: {
        contentType_contentId_locale: {
          contentType: 'open_position',
          contentId: position.id,
          locale,
        },
      },
    });
    if (existing?.status === 'translated' && existing.sourceHash === hash)
      return;

    const acquired = await this.acquireLock(position.id, locale);
    if (!acquired) return; // another request (e.g. a concurrent GET) is already handling it

    await this.translateAndStore([position], locale);
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
