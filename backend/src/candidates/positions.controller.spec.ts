import { PositionsController } from './positions.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { TranslationService } from '../translations/translation.service';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { RedisService } from '../redis/redis.service';
import { Role, type User } from '../generated/prisma';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

describe('PositionsController', () => {
  const admin = { id: 'admin-1' } as User;

  function makeController() {
    const prisma = {
      openPosition: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    const translations = {
      getTranslatedPositions: jest.fn().mockResolvedValue(new Map()),
      triggerAsync: jest.fn(),
      invalidate: jest.fn().mockResolvedValue(undefined),
    } as unknown as TranslationService;
    const auditLog = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      del: jest.fn(),
    } as unknown as RedisService;
    return {
      controller: new PositionsController(
        prisma,
        translations,
        auditLog,
        redis,
      ),
      prisma,
      translations,
      auditLog,
      redis,
    };
  }

  describe('listOpen', () => {
    it('only ever queries isOpen positions', async () => {
      const { controller, prisma } = makeController();
      (prisma.openPosition.findMany as jest.Mock).mockResolvedValue([]);
      await controller.listOpen();
      expect(prisma.openPosition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isOpen: true } }),
      );
    });

    // Regression guard: no locale param must take the exact same path as
    // before this endpoint had any translation awareness — zero calls
    // into TranslationService.
    it('with no locale param, returns the raw positions untouched and never calls TranslationService', async () => {
      const { controller, prisma, translations } = makeController();
      const positions = [{ id: 'pos-1', title: 'Engineer' }];
      (prisma.openPosition.findMany as jest.Mock).mockResolvedValue(positions);

      const result = await controller.listOpen();

      expect(result).toBe(positions);
      expect(translations.getTranslatedPositions).not.toHaveBeenCalled();
    });

    it("with locale='en' explicitly, behaves identically to no locale at all", async () => {
      const { controller, prisma, translations } = makeController();
      const positions = [{ id: 'pos-1', title: 'Engineer' }];
      (prisma.openPosition.findMany as jest.Mock).mockResolvedValue(positions);

      const result = await controller.listOpen('en');

      expect(result).toBe(positions);
      expect(translations.getTranslatedPositions).not.toHaveBeenCalled();
    });

    it('with an unrecognized locale, falls back to the untranslated path rather than erroring', async () => {
      const { controller, prisma, translations } = makeController();
      const positions = [{ id: 'pos-1', title: 'Engineer' }];
      (prisma.openPosition.findMany as jest.Mock).mockResolvedValue(positions);

      const result = await controller.listOpen('fr');

      expect(result).toBe(positions);
      expect(translations.getTranslatedPositions).not.toHaveBeenCalled();
    });

    it("with locale='ar', calls TranslationService and merges its result onto each position", async () => {
      const { controller, prisma, translations } = makeController();
      const position = {
        id: 'pos-1',
        title: 'Engineer',
        description: 'desc',
        department: 'Eng',
      };
      (prisma.openPosition.findMany as jest.Mock).mockResolvedValue([position]);
      (translations.getTranslatedPositions as jest.Mock).mockResolvedValue(
        new Map([
          [
            'pos-1',
            {
              status: 'translated',
              title: 'مهندس',
              description: 'وصف',
              department: 'هندسة',
            },
          ],
        ]),
      );

      const result = await controller.listOpen('ar');

      expect(translations.getTranslatedPositions).toHaveBeenCalledWith(
        [position],
        'ar',
      );
      expect(result).toEqual([
        {
          ...position,
          status: 'translated',
          title: 'مهندس',
          description: 'وصف',
          department: 'هندسة',
        },
      ]);
    });

    // The public Careers page must degrade to an uncached DB read on a
    // Redis outage, never 500 — this is the real-world failure mode the
    // whole cache-aside pattern needs to survive.
    it('falls back to a fresh DB read when redis.get rejects', async () => {
      const { controller, prisma, redis } = makeController();
      (redis.get as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
      const positions = [{ id: 'pos-1', title: 'Engineer' }];
      (prisma.openPosition.findMany as jest.Mock).mockResolvedValue(positions);

      const result = await controller.listOpen();

      expect(result).toBe(positions);
    });

    it('still returns the result when redis.set rejects after a cache miss', async () => {
      const { controller, prisma, redis } = makeController();
      (redis.set as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
      const positions = [{ id: 'pos-1', title: 'Engineer' }];
      (prisma.openPosition.findMany as jest.Mock).mockResolvedValue(positions);

      const result = await controller.listOpen();

      expect(result).toBe(positions);
    });

    // LibreTranslate being unreachable must fall back to the untranslated
    // (English-field) response, not 500 the page for 'ar'/'zh' visitors.
    it('falls back to the untranslated positions when TranslationService rejects', async () => {
      const { controller, prisma, translations } = makeController();
      const positions = [{ id: 'pos-1', title: 'Engineer' }];
      (prisma.openPosition.findMany as jest.Mock).mockResolvedValue(positions);
      (translations.getTranslatedPositions as jest.Mock).mockRejectedValue(
        new Error('LibreTranslate unreachable'),
      );

      const result = await controller.listOpen('ar');

      expect(result).toBe(positions);
    });
  });

  it('the admin listAll endpoint has no isOpen filter', async () => {
    const { controller, prisma } = makeController();
    await controller.listAll();
    const call = (prisma.openPosition.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toBeUndefined();
  });

  describe('create', () => {
    it("attaches the posting admin's id", async () => {
      const { controller, prisma } = makeController();
      (prisma.openPosition.create as jest.Mock).mockResolvedValue({
        id: 'pos-1',
        isOpen: true,
      });

      await controller.create(admin, {
        title: 'Engineer',
        department: 'Engineering',
        description: 'desc',
      });

      expect(prisma.openPosition.create).toHaveBeenCalledWith({
        data: {
          title: 'Engineer',
          department: 'Engineering',
          description: 'desc',
          createdByAdminId: admin.id,
        },
      });
    });

    it('triggers async translation for an open position', async () => {
      const { controller, prisma, translations } = makeController();
      const created = { id: 'pos-1', isOpen: true };
      (prisma.openPosition.create as jest.Mock).mockResolvedValue(created);

      await controller.create(admin, {
        title: 'Engineer',
        department: 'Engineering',
        description: 'desc',
      });

      expect(translations.triggerAsync).toHaveBeenCalledWith(created, [
        'ar',
        'zh',
      ]);
    });

    it('does not trigger translation for a position created already closed', async () => {
      const { controller, prisma, translations } = makeController();
      (prisma.openPosition.create as jest.Mock).mockResolvedValue({
        id: 'pos-1',
        isOpen: false,
      });

      await controller.create(admin, {
        title: 'Engineer',
        department: 'Engineering',
        description: 'desc',
      });

      expect(translations.triggerAsync).not.toHaveBeenCalled();
    });

    // The DB write already succeeded by the time cache invalidation runs
    // — one locale's redis.del rejecting must not turn a successful
    // create into a 500 response to the admin.
    it("still returns the created position when one locale's cache invalidation fails", async () => {
      const { controller, prisma, redis } = makeController();
      const created = { id: 'pos-1', isOpen: true };
      (prisma.openPosition.create as jest.Mock).mockResolvedValue(created);
      (redis.del as jest.Mock)
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(1);

      const result = await controller.create(admin, {
        title: 'Engineer',
        department: 'Engineering',
        description: 'desc',
      });

      expect(result).toBe(created);
    });
  });

  describe('update', () => {
    it('can close a position via isOpen: false', async () => {
      const { controller, prisma } = makeController();
      (prisma.openPosition.update as jest.Mock).mockResolvedValue({
        id: 'pos-1',
        isOpen: false,
      });

      await controller.update('pos-1', { isOpen: false });

      expect(prisma.openPosition.update).toHaveBeenCalledWith({
        where: { id: 'pos-1' },
        data: { isOpen: false },
      });
    });

    it('does not trigger translation when the update closes the position', async () => {
      const { controller, prisma, translations } = makeController();
      (prisma.openPosition.update as jest.Mock).mockResolvedValue({
        id: 'pos-1',
        isOpen: false,
      });

      await controller.update('pos-1', { isOpen: false });

      expect(translations.triggerAsync).not.toHaveBeenCalled();
    });

    it('triggers translation on any update to a still-open position, not just title/description/department changes', async () => {
      const { controller, prisma, translations } = makeController();
      const updated = { id: 'pos-1', isOpen: true };
      (prisma.openPosition.update as jest.Mock).mockResolvedValue(updated);

      await controller.update('pos-1', { isOpen: true });

      expect(translations.triggerAsync).toHaveBeenCalledWith(updated, [
        'ar',
        'zh',
      ]);
    });
  });

  describe('invalidateTranslation', () => {
    it('invalidates the translation and records an audit log entry', async () => {
      const { controller, translations, auditLog } = makeController();

      const result = await controller.invalidateTranslation(
        admin,
        'pos-1',
        'ar',
      );

      expect(translations.invalidate).toHaveBeenCalledWith(
        'open_position',
        'pos-1',
        'ar',
      );
      expect(auditLog.record).toHaveBeenCalledWith({
        actorUserId: admin.id,
        action: 'position_translation.invalidated',
        targetType: 'OpenPosition',
        targetId: 'pos-1',
        metadata: { locale: 'ar' },
      });
      expect(result).toEqual({ ok: true });
    });

    it('requires the admin role', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        PositionsController.prototype.invalidateTranslation,
      );
      expect(roles).toEqual([Role.admin]);
    });
  });
});
