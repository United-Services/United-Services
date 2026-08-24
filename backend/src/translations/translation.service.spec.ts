import { TranslationService } from './translation.service';
import type { LibreTranslateClient } from './libretranslate.client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { OpenPosition, Service } from '../generated/prisma';

function makePosition(overrides: Partial<OpenPosition> = {}): OpenPosition {
  return {
    id: 'pos-1',
    title: 'Engineer',
    description: 'Build things',
    department: 'Engineering',
    isOpen: true,
    createdByAdminId: 'admin-1',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc-1',
    slug: 'gre-lining',
    name: 'GRE Tubular Lining',
    shortDescription: 'API 15CLT · Internal Corrosion Barrier',
    longDescription: 'A chemically inert internal barrier for steel pipelines.',
    specs: ['API 15CLT Compliant', 'DN50 – DN600'],
    imageS3Key: null,
    iconKey: 'gre-lining',
    order: 1,
    updatedAt: new Date(),
    updatedByAdminId: 'admin-1',
    ...overrides,
  };
}

// Real in-memory Redis-like store — enough to exercise NX-locking and
// incrby semantics without a full ioredis mock (same approach as
// mfa.service.spec.ts's replay-guard tests).
function makeRedisMock() {
  const store = new Map<string, string>();
  return {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, value: string, ...args: unknown[]) => {
      const nx = args.includes('NX');
      if (nx && store.has(key)) return Promise.resolve(null);
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
    incrby: jest.fn((key: string, amount: number) => {
      const next = Number(store.get(key) ?? 0) + amount;
      store.set(key, String(next));
      return Promise.resolve(next);
    }),
    _store: store,
  };
}

function makePrismaMock() {
  const rows = new Map<string, any>();
  const rowKey = (contentType: string, contentId: string, locale: string) =>
    `${contentType}:${contentId}:${locale}`;

  return {
    openPosition: { findUnique: jest.fn() },
    service: { findUnique: jest.fn() },
    contentTranslation: {
      findMany: jest.fn(({ where }: any) => {
        const ids: string[] = where.contentId.in;
        return Promise.resolve(
          ids
            .map((id) => rows.get(rowKey(where.contentType, id, where.locale)))
            .filter(Boolean),
        );
      }),
      findUnique: jest.fn(({ where }: any) => {
        const w = where.contentType_contentId_locale;
        return Promise.resolve(
          rows.get(rowKey(w.contentType, w.contentId, w.locale)) ?? null,
        );
      }),
      upsert: jest.fn(({ where, create, update }: any) => {
        const w = where.contentType_contentId_locale;
        const key = rowKey(w.contentType, w.contentId, w.locale);
        const existing = rows.get(key);
        const next = existing ? { ...existing, ...update } : { ...create };
        rows.set(key, next);
        return Promise.resolve(next);
      }),
      update: jest.fn(({ where, data }: any) => {
        const w = where.contentType_contentId_locale;
        const key = rowKey(w.contentType, w.contentId, w.locale);
        const next = { ...(rows.get(key) ?? {}), ...data };
        rows.set(key, next);
        return Promise.resolve(next);
      }),
      updateMany: jest.fn(({ where, data }: any) => {
        for (const [key, row] of rows) {
          if (
            row.contentType === where.contentType &&
            row.contentId === where.contentId &&
            row.locale === where.locale
          ) {
            rows.set(key, { ...row, ...data });
          }
        }
        return Promise.resolve({ count: 1 });
      }),
    },
    _rows: rows,
  };
}

describe('TranslationService', () => {
  let redis: ReturnType<typeof makeRedisMock>;
  let prisma: ReturnType<typeof makePrismaMock>;
  let libreTranslate: { translateBatch: jest.Mock };
  let queue: { add: jest.Mock };
  let service: TranslationService;

  beforeEach(() => {
    redis = makeRedisMock();
    prisma = makePrismaMock();
    libreTranslate = { translateBatch: jest.fn() };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new TranslationService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      libreTranslate as unknown as LibreTranslateClient,
      queue as any,
    );
  });

  describe('computeSourceHash', () => {
    it('is stable across key order', () => {
      const a = service.computeSourceHash({ title: 'x', description: 'y' });
      const b = service.computeSourceHash({ description: 'y', title: 'x' });
      expect(a).toBe(b);
    });

    it('differs when a field value changes', () => {
      const a = service.computeSourceHash({ title: 'x' });
      const b = service.computeSourceHash({ title: 'z' });
      expect(a).not.toBe(b);
    });
  });

  describe('getTranslatedPositions', () => {
    it('returns cached content with zero LibreTranslate calls when the stored hash matches', async () => {
      const position = makePosition();
      const hash = service.computeSourceHash({
        title: position.title,
        description: position.description,
        department: position.department,
      });
      prisma._rows.set('open_position:pos-1:ar', {
        contentType: 'open_position',
        contentId: 'pos-1',
        locale: 'ar',
        status: 'translated',
        sourceHash: hash,
        fields: {
          title: 'مهندس',
          description: 'بناء أشياء',
          department: 'هندسة',
        },
      });

      const result = await service.getTranslatedPositions([position], 'ar');

      expect(result.get('pos-1')).toEqual({
        status: 'translated',
        title: 'مهندس',
        description: 'بناء أشياء',
        department: 'هندسة',
      });
      expect(libreTranslate.translateBatch).not.toHaveBeenCalled();
    });

    it('a stale sourceHash (content changed since last translation) triggers retranslation instead of serving stale content', async () => {
      const position = makePosition({ title: 'Senior Engineer' });
      prisma._rows.set('open_position:pos-1:ar', {
        contentType: 'open_position',
        contentId: 'pos-1',
        locale: 'ar',
        status: 'translated',
        sourceHash: 'stale-hash-from-before-the-edit',
        fields: {
          title: 'مهندس',
          description: 'بناء أشياء',
          department: 'هندسة',
        },
      });
      libreTranslate.translateBatch.mockResolvedValue({
        translations: ['مهندس أول', 'بناء أشياء', 'هندسة'],
        charCount: 30,
      });

      const result = await service.getTranslatedPositions([position], 'ar');

      expect(libreTranslate.translateBatch).toHaveBeenCalled();
      expect(result.get('pos-1')?.title).toBe('مهندس أول');
    });

    it('a never-translated position (missing row) is translated and cached', async () => {
      const position = makePosition();
      libreTranslate.translateBatch.mockResolvedValue({
        translations: ['مهندس', 'بناء أشياء', 'هندسة'],
        charCount: 30,
      });

      const result = await service.getTranslatedPositions([position], 'ar');

      expect(result.get('pos-1')).toEqual({
        status: 'translated',
        title: 'مهندس',
        description: 'بناء أشياء',
        department: 'هندسة',
      });
      const stored = prisma._rows.get('open_position:pos-1:ar');
      expect(stored.status).toBe('translated');
      expect(stored.sourceHash).toBe(
        service.computeSourceHash({
          title: position.title,
          description: position.description,
          department: position.department,
        }),
      );
    });

    it('a previously-failed translation is retried, not permanently given up on', async () => {
      const position = makePosition();
      const hash = service.computeSourceHash({
        title: position.title,
        description: position.description,
        department: position.department,
      });
      prisma._rows.set('open_position:pos-1:ar', {
        contentType: 'open_position',
        contentId: 'pos-1',
        locale: 'ar',
        status: 'failed',
        sourceHash: hash,
        fields: {},
        errorMessage: 'a transient API error',
      });
      libreTranslate.translateBatch.mockResolvedValue({
        translations: ['مهندس', 'بناء أشياء', 'هندسة'],
        charCount: 30,
      });

      const result = await service.getTranslatedPositions([position], 'ar');

      expect(libreTranslate.translateBatch).toHaveBeenCalled();
      expect(result.get('pos-1')?.status).toBe('translated');
    });

    // The core concurrency guarantee: N simultaneous requests for the same
    // untranslated position must never turn into N calls to the
    // translation backend.
    it('concurrent requests for the same untranslated position result in exactly one LibreTranslate call', async () => {
      const position = makePosition();
      let resolveTranslate: (v: any) => void;
      libreTranslate.translateBatch.mockReturnValue(
        new Promise((resolve) => {
          resolveTranslate = resolve;
        }),
      );

      const calls = Promise.all([
        service.getTranslatedPositions([position], 'ar'),
        service.getTranslatedPositions([position], 'ar'),
        service.getTranslatedPositions([position], 'ar'),
      ]);

      // Let all three requests race to acquire the lock before resolving
      // the (single) in-flight translation call.
      await new Promise((r) => setTimeout(r, 10));
      resolveTranslate!({
        translations: ['مهندس', 'بناء أشياء', 'هندسة'],
        charCount: 30,
      });

      await calls;

      expect(libreTranslate.translateBatch).toHaveBeenCalledTimes(1);
    }, 10000);

    it('a LibreTranslate failure results in status: failed and an English fallback, never a thrown error', async () => {
      const position = makePosition();
      libreTranslate.translateBatch.mockRejectedValue(
        new Error('LibreTranslate container unreachable'),
      );

      const result = await service.getTranslatedPositions([position], 'ar');

      expect(result.get('pos-1')).toEqual({
        status: 'failed',
        title: position.title,
        description: position.description,
        department: position.department,
      });
      const stored = prisma._rows.get('open_position:pos-1:ar');
      expect(stored.status).toBe('failed');
      expect(stored.errorMessage).toContain('unreachable');
    });

    it('the throughput guard skips the call once the monthly counter is at/over budget, without throwing', async () => {
      process.env.TRANSLATION_MONTHLY_CHAR_BUDGET = '10';
      const monthKey = `translation:usage:${new Date().toISOString().slice(0, 7)}`;
      redis._store.set(monthKey, '10');
      const position = makePosition();

      const result = await service.getTranslatedPositions([position], 'ar');

      expect(libreTranslate.translateBatch).not.toHaveBeenCalled();
      expect(result.get('pos-1')?.status).toBe('failed');
      const stored = prisma._rows.get('open_position:pos-1:ar');
      expect(stored.errorMessage).toContain('volume guard');

      delete process.env.TRANSLATION_MONTHLY_CHAR_BUDGET;
    });
  });

  describe('getTranslatedServices', () => {
    it('translates name/shortDescription/longDescription but never specs', async () => {
      const service_ = makeService();
      libreTranslate.translateBatch.mockResolvedValue({
        translations: ['تبطين GRE الأنبوبي', 'وصف قصير', 'وصف طويل'],
        charCount: 40,
      });

      const result = await service.getTranslatedServices([service_], 'ar');

      expect(libreTranslate.translateBatch).toHaveBeenCalledWith(
        [service_.name, service_.shortDescription, service_.longDescription],
        'ar',
      );
      expect(result.get('svc-1')).toEqual({
        status: 'translated',
        name: 'تبطين GRE الأنبوبي',
        shortDescription: 'وصف قصير',
        longDescription: 'وصف طويل',
      });
      // specs never appears in the translated result at all — it isn't
      // a translatable field for this content type.
      expect(result.get('svc-1')).not.toHaveProperty('specs');
    });

    it('returns cached content with zero LibreTranslate calls when the stored hash matches', async () => {
      const service_ = makeService();
      const hash = service.computeSourceHash({
        name: service_.name,
        shortDescription: service_.shortDescription,
        longDescription: service_.longDescription,
      });
      prisma._rows.set('service:svc-1:zh', {
        contentType: 'service',
        contentId: 'svc-1',
        locale: 'zh',
        status: 'translated',
        sourceHash: hash,
        fields: {
          name: 'GRE 管道内衬',
          shortDescription: '简短描述',
          longDescription: '长描述',
        },
      });

      const result = await service.getTranslatedServices([service_], 'zh');

      expect(result.get('svc-1')).toEqual({
        status: 'translated',
        name: 'GRE 管道内衬',
        shortDescription: '简短描述',
        longDescription: '长描述',
      });
      expect(libreTranslate.translateBatch).not.toHaveBeenCalled();
    });

    it('a stale sourceHash (content edited since last translation) triggers retranslation', async () => {
      const service_ = makeService({ name: 'Updated Name' });
      prisma._rows.set('service:svc-1:ar', {
        contentType: 'service',
        contentId: 'svc-1',
        locale: 'ar',
        status: 'translated',
        sourceHash: 'stale-hash',
        fields: {
          name: 'اسم قديم',
          shortDescription: 'وصف',
          longDescription: 'وصف طويل',
        },
      });
      libreTranslate.translateBatch.mockResolvedValue({
        translations: ['اسم محدث', 'وصف', 'وصف طويل'],
        charCount: 20,
      });

      const result = await service.getTranslatedServices([service_], 'ar');

      expect(libreTranslate.translateBatch).toHaveBeenCalled();
      expect(result.get('svc-1')?.name).toBe('اسم محدث');
    });

    it('a LibreTranslate failure results in status: failed and an English fallback, never a thrown error', async () => {
      const service_ = makeService();
      libreTranslate.translateBatch.mockRejectedValue(
        new Error('LibreTranslate container unreachable'),
      );

      const result = await service.getTranslatedServices([service_], 'ar');

      expect(result.get('svc-1')).toEqual({
        status: 'failed',
        name: service_.name,
        shortDescription: service_.shortDescription,
        longDescription: service_.longDescription,
      });
    });
  });

  describe('triggerServiceAsync', () => {
    it('enqueues one job per locale instead of translating inline', () => {
      const service_ = makeService();

      service.triggerServiceAsync(service_, ['ar', 'zh']);

      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenCalledWith(
        'service:svc-1:ar',
        { contentType: 'service', contentId: 'svc-1', locale: 'ar' },
        expect.objectContaining({ attempts: 3, jobId: 'service:svc-1:ar' }),
      );
    });
  });

  describe('processQueuedJob (service)', () => {
    it('translates and stores a service translation, keyed under contentType "service"', async () => {
      const service_ = makeService();
      prisma.service.findUnique.mockResolvedValue(service_);
      libreTranslate.translateBatch.mockResolvedValue({
        translations: ['اسم', 'وصف قصير', 'وصف طويل'],
        charCount: 20,
      });

      await service.processQueuedJob({
        contentType: 'service',
        contentId: 'svc-1',
        locale: 'ar',
      });

      const stored = prisma._rows.get('service:svc-1:ar');
      expect(stored.status).toBe('translated');
      expect(stored.fields.name).toBe('اسم');
    });

    it('does not retranslate when the stored hash already matches the current content', async () => {
      const service_ = makeService();
      prisma.service.findUnique.mockResolvedValue(service_);
      const hash = service.computeSourceHash({
        name: service_.name,
        shortDescription: service_.shortDescription,
        longDescription: service_.longDescription,
      });
      prisma._rows.set('service:svc-1:ar', {
        contentType: 'service',
        contentId: 'svc-1',
        locale: 'ar',
        status: 'translated',
        sourceHash: hash,
        fields: {
          name: 'اسم',
          shortDescription: 'وصف قصير',
          longDescription: 'وصف طويل',
        },
      });

      await service.processQueuedJob({
        contentType: 'service',
        contentId: 'svc-1',
        locale: 'ar',
      });

      expect(libreTranslate.translateBatch).not.toHaveBeenCalled();
    });

    it('is a successful no-op when the service has since been deleted', async () => {
      prisma.service.findUnique.mockResolvedValue(null);

      await expect(
        service.processQueuedJob({
          contentType: 'service',
          contentId: 'svc-gone',
          locale: 'ar',
        }),
      ).resolves.toBeUndefined();
      expect(libreTranslate.translateBatch).not.toHaveBeenCalled();
    });
  });

  describe('invalidate', () => {
    it('resets a translation row back to missing', async () => {
      prisma._rows.set('open_position:pos-1:ar', {
        contentType: 'open_position',
        contentId: 'pos-1',
        locale: 'ar',
        status: 'translated',
        sourceHash: 'some-hash',
        fields: { title: 'مهندس' },
      });

      await service.invalidate('open_position', 'pos-1', 'ar');

      const stored = prisma._rows.get('open_position:pos-1:ar');
      expect(stored.status).toBe('missing');
    });
  });

  describe('triggerAsync', () => {
    it('enqueues one job per locale and never throws, even if enqueueing itself fails', () => {
      const position = makePosition();

      expect(() => service.triggerAsync(position, ['ar', 'zh'])).not.toThrow();
      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenCalledWith(
        'open_position:pos-1:zh',
        { contentType: 'open_position', contentId: 'pos-1', locale: 'zh' },
        expect.objectContaining({ attempts: 3 }),
      );
    });
  });

  describe('processQueuedJob (open_position)', () => {
    it('translates each locale independently, one job at a time', async () => {
      const position = makePosition();
      prisma.openPosition.findUnique.mockResolvedValue(position);
      libreTranslate.translateBatch.mockImplementation((_texts, locale) =>
        locale === 'ar'
          ? Promise.reject(new Error('ar backend down'))
          : Promise.resolve({
              translations: ['engineer-zh', 'build-zh', 'eng-zh'],
              charCount: 20,
            }),
      );

      await service.processQueuedJob({
        contentType: 'open_position',
        contentId: 'pos-1',
        locale: 'ar',
      });
      await service.processQueuedJob({
        contentType: 'open_position',
        contentId: 'pos-1',
        locale: 'zh',
      });

      expect(prisma._rows.get('open_position:pos-1:ar').status).toBe('failed');
      expect(prisma._rows.get('open_position:pos-1:zh').status).toBe(
        'translated',
      );
    });

    it('does not retranslate when the stored hash already matches the current content', async () => {
      const position = makePosition();
      prisma.openPosition.findUnique.mockResolvedValue(position);
      const hash = service.computeSourceHash({
        title: position.title,
        description: position.description,
        department: position.department,
      });
      prisma._rows.set('open_position:pos-1:ar', {
        contentType: 'open_position',
        contentId: 'pos-1',
        locale: 'ar',
        status: 'translated',
        sourceHash: hash,
        fields: {
          title: 'مهندس',
          description: 'بناء أشياء',
          department: 'هندسة',
        },
      });

      await service.processQueuedJob({
        contentType: 'open_position',
        contentId: 'pos-1',
        locale: 'ar',
      });

      expect(libreTranslate.translateBatch).not.toHaveBeenCalled();
    });

    it('is a successful no-op when the position has since been deleted', async () => {
      prisma.openPosition.findUnique.mockResolvedValue(null);

      await expect(
        service.processQueuedJob({
          contentType: 'open_position',
          contentId: 'pos-gone',
          locale: 'ar',
        }),
      ).resolves.toBeUndefined();
      expect(libreTranslate.translateBatch).not.toHaveBeenCalled();
    });
  });
});
