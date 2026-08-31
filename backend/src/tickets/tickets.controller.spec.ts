import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { S3Service } from '../s3/s3.service';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { Queue } from 'bullmq';
import { Role, type User } from '../generated/prisma';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

// Valid magic bytes for each allowed screenshot content type, keyed by the
// jpg/png/webp extension presign() would put on the key.
const VALID_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

describe('TicketsController', () => {
  const admin = { id: 'admin-1' } as User;

  // docs/BUSINESS_RULES.md rule 17: list/updateStatus are exclusively
  // super_admin, never a plain admin. See the e2e super-admin-role spec
  // for the real-HTTP version of this same guarantee, and
  // audit-log.controller.spec.ts for the sibling exclusive feature.
  it('gates list() and updateStatus() to exactly Role.super_admin, not admin or ADMIN_ROLES', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, TicketsController.prototype.list),
    ).toEqual([Role.super_admin]);
    expect(
      Reflect.getMetadata(ROLES_KEY, TicketsController.prototype.updateStatus),
    ).toEqual([Role.super_admin]);
  });

  it('leaves presign() and create() public and role-unrestricted (submitting a ticket needs no account)', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, TicketsController.prototype.presign),
    ).toBe(true);
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, TicketsController.prototype.create),
    ).toBe(true);
    expect(
      Reflect.getMetadata(ROLES_KEY, TicketsController.prototype.presign),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(ROLES_KEY, TicketsController.prototype.create),
    ).toBeUndefined();
  });

  function makeController() {
    const prisma = {
      ticket: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
    const s3 = {
      createUploadUrl: jest.fn().mockResolvedValue('https://s3.example/put'),
      createDownloadUrl: jest
        .fn()
        .mockResolvedValue('https://s3.example/get?signed=1'),
      readLeadingBytes: jest.fn().mockResolvedValue(VALID_JPEG),
      getObjectSize: jest.fn().mockResolvedValue(1024),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      promoteUpload: jest.fn().mockResolvedValue(undefined),
    } as unknown as S3Service;
    const auditLog = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;
    const archiveQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    } as unknown as Queue<any>;
    return {
      controller: new TicketsController(prisma, s3, auditLog, archiveQueue),
      prisma,
      s3,
      auditLog,
      archiveQueue,
    };
  }

  describe('presign', () => {
    it('rejects an unsupported contentType', async () => {
      const { controller } = makeController();
      await expect(
        controller.presign({ contentType: 'application/pdf' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each(['image/jpeg', 'image/png', 'image/webp'])(
      'accepts %s and returns a url + pending key',
      async (contentType) => {
        const { controller, s3 } = makeController();
        const result = await controller.presign({ contentType });
        expect(result.url).toBe('https://s3.example/put');
        expect(result.key.startsWith('pending/tickets/')).toBe(true);
        expect(s3.createUploadUrl).toHaveBeenCalledWith(
          result.key,
          contentType,
        );
      },
    );

    it('generates a unique key on each call (no collisions)', async () => {
      const { controller } = makeController();
      const a = await controller.presign({ contentType: 'image/jpeg' });
      const b = await controller.presign({ contentType: 'image/jpeg' });
      expect(a.key).not.toBe(b.key);
    });
  });

  describe('create', () => {
    const baseDto = {
      name: 'Jane',
      email: 'jane@example.com',
      company: 'Acme',
      type: 'technical' as const,
      details: 'It broke',
    };

    it('rejects a screenshotS3Key not under pending/tickets/ (malicious key)', async () => {
      const { controller } = makeController();
      await expect(
        controller.create({
          ...baseDto,
          screenshotS3Key: 'tickets/other-ticket/x.jpg',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        controller.create({
          ...baseDto,
          screenshotS3Key: 'pending/candidates/victim/x.jpg',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a ticket when screenshotS3Key is omitted', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.ticket.create as jest.Mock).mockResolvedValue({ id: 't-1' });

      const result = await controller.create({ ...baseDto });

      expect(result).toEqual({ id: 't-1' });
      expect(s3.getObjectSize).not.toHaveBeenCalled();
      expect(s3.promoteUpload).not.toHaveBeenCalled();
    });

    it('creates the ticket but discards the screenshot when magic bytes mismatch the claimed type', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.ticket.create as jest.Mock).mockResolvedValue({ id: 't-2' });
      (s3.readLeadingBytes as jest.Mock).mockResolvedValue(
        Buffer.from('not an image at all'),
      );

      const result = await controller.create({
        ...baseDto,
        screenshotS3Key: 'pending/tickets/123-abc.jpg',
      });

      expect(result).toEqual({ id: 't-2' });
      expect(s3.deleteObject).toHaveBeenCalledWith(
        'pending/tickets/123-abc.jpg',
      );
      expect(s3.promoteUpload).not.toHaveBeenCalled();
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it('creates the ticket but discards the screenshot when it exceeds MAX_SCREENSHOT_BYTES', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.ticket.create as jest.Mock).mockResolvedValue({ id: 't-3' });
      (s3.getObjectSize as jest.Mock).mockResolvedValue(5 * 1024 * 1024 + 1);

      const result = await controller.create({
        ...baseDto,
        screenshotS3Key: 'pending/tickets/123-abc.jpg',
      });

      expect(result).toEqual({ id: 't-3' });
      expect(s3.deleteObject).toHaveBeenCalledWith(
        'pending/tickets/123-abc.jpg',
      );
      expect(s3.promoteUpload).not.toHaveBeenCalled();
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it('accepts a screenshot that is exactly 5MB (boundary is inclusive)', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.ticket.create as jest.Mock).mockResolvedValue({ id: 't-4' });
      (s3.getObjectSize as jest.Mock).mockResolvedValue(5 * 1024 * 1024);

      const result = await controller.create({
        ...baseDto,
        screenshotS3Key: 'pending/tickets/123-abc.jpg',
      });

      expect(result).toEqual({ id: 't-4' });
      expect(s3.deleteObject).not.toHaveBeenCalled();
      expect(s3.promoteUpload).toHaveBeenCalledWith(
        'pending/tickets/123-abc.jpg',
        'tickets/t-4/123-abc.jpg',
      );
      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 't-4' },
        data: { screenshotS3Key: 'tickets/t-4/123-abc.jpg' },
      });
    });

    // This is the most public, least-authenticated surface in the app —
    // @Public() plus a tight 5/min @Throttle specifically because anyone
    // on the internet can hit it with arbitrary text. The backend's own
    // job here is narrow: don't choke on adversarial input. Rejecting
    // over-limit strings is CreateTicketDto's @MaxLength (enforced by the
    // global ValidationPipe before create() ever runs — bypassed here
    // since these tests call the controller method directly, so the
    // DTO-level rejection itself is covered separately in
    // create-ticket.dto.spec.ts). Unicode/HTML content, by contrast,
    // should pass straight through unmolested: Prisma parameterizes every
    // query, so nothing here is ever concatenated into SQL, and escaping
    // HTML for safe display is React's job on the admin dashboard
    // (default JSX escaping), not this endpoint's — a raw <script> tag is
    // just inert stored data as far as the backend is concerned.
    it('stores unicode/emoji in name and details without alteration', async () => {
      const { controller, prisma } = makeController();
      (prisma.ticket.create as jest.Mock).mockResolvedValue({ id: 't-emoji' });

      const unicodeName = '日本語テスト 🎉🔥 Ñoño';
      const unicodeDetails = 'Emoji stress test: 😀😃😄🚀💥 — 中文测试 — मानक';

      await controller.create({
        ...baseDto,
        name: unicodeName,
        details: unicodeDetails,
      });

      expect(prisma.ticket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: unicodeName,
          details: unicodeDetails,
        }),
      });
    });

    it('stores HTML/script-shaped strings as inert literal data rather than rejecting or interpreting them', async () => {
      const { controller, prisma } = makeController();
      (prisma.ticket.create as jest.Mock).mockResolvedValue({ id: 't-html' });

      const scriptName = '<script>alert(document.cookie)</script>';
      const scriptDetails =
        '"><img src=x onerror=alert(1)>\' OR 1=1; DROP TABLE tickets; --';

      const result = await controller.create({
        ...baseDto,
        name: scriptName,
        details: scriptDetails,
      });

      expect(result).toEqual({ id: 't-html' });
      // Passed through to Prisma verbatim, as a plain parameterized value
      // — not stripped, escaped, or otherwise transformed. Prisma's
      // parameterization means this is stored as inert text; sanitizing
      // it here would be redundant with (and no substitute for) React's
      // default escaping on render.
      expect(prisma.ticket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: scriptName,
          details: scriptDetails,
        }),
      });
    });

    it('promotes a valid screenshot (right type and size) and updates the ticket row', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.ticket.create as jest.Mock).mockResolvedValue({ id: 't-5' });
      (s3.getObjectSize as jest.Mock).mockResolvedValue(2048);
      (s3.readLeadingBytes as jest.Mock).mockResolvedValue(VALID_JPEG);

      const result = await controller.create({
        ...baseDto,
        screenshotS3Key: 'pending/tickets/999-xyz.jpg',
      });

      expect(result).toEqual({ id: 't-5' });
      expect(s3.promoteUpload).toHaveBeenCalledWith(
        'pending/tickets/999-xyz.jpg',
        'tickets/t-5/999-xyz.jpg',
      );
      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 't-5' },
        data: { screenshotS3Key: 'tickets/t-5/999-xyz.jpg' },
      });
    });
  });

  describe('list', () => {
    function ticket(overrides: Partial<any>) {
      return {
        id: 'id',
        name: 'n',
        email: 'e@e.com',
        company: null,
        type: 'technical',
        details: 'd',
        status: 'unresolved',
        contactedAt: null,
        screenshotS3Key: null,
        createdAt: new Date('2026-01-01'),
        ...overrides,
      };
    }

    it('orders by type (technical, disabled_account, non_technical) then createdAt ascending', async () => {
      const { controller, prisma } = makeController();
      // findMany's orderBy does the real sorting in Postgres; here we
      // assert the controller requests that exact ordering.
      (prisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
      await controller.list(undefined, 0, 20);
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
        }),
      );
    });

    it('returns rows already ordered by type then createdAt as given by the DB layer', async () => {
      const { controller, prisma } = makeController();
      const rows = [
        ticket({
          id: 'a',
          type: 'technical',
          createdAt: new Date('2026-01-01'),
        }),
        ticket({
          id: 'b',
          type: 'technical',
          createdAt: new Date('2026-01-02'),
        }),
        ticket({
          id: 'c',
          type: 'disabled_account',
          createdAt: new Date('2026-01-01'),
        }),
        ticket({
          id: 'd',
          type: 'non_technical',
          createdAt: new Date('2026-01-01'),
        }),
      ];
      (prisma.ticket.findMany as jest.Mock).mockResolvedValue(rows);

      const result = await controller.list(undefined, 0, 20);
      expect(result.items.map((i: any) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('q fuzzy-search matches on a single field (company) and excludes non-matches', async () => {
      const { controller, prisma } = makeController();
      const rows = [
        ticket({ id: 'match', company: 'Acme Corp' }),
        ticket({ id: 'nomatch', company: 'Globex' }),
      ];
      (prisma.ticket.findMany as jest.Mock).mockResolvedValue(rows);

      const result = await controller.list('Acme', 0, 20);
      expect(result.items.map((i: any) => i.id)).toEqual(['match']);
    });

    it('q matching nothing returns an empty result, not an error or all tickets', async () => {
      const { controller, prisma } = makeController();
      const rows = [ticket({ id: 'a' }), ticket({ id: 'b' })];
      (prisma.ticket.findMany as jest.Mock).mockResolvedValue(rows);

      const result = await controller.list('zzz-nope-zzz', 0, 20);
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('hasMore is true when take is less than the number of matching rows', async () => {
      const { controller, prisma } = makeController();
      const rows = [
        ticket({ id: 'a' }),
        ticket({ id: 'b' }),
        ticket({ id: 'c' }),
      ];
      (prisma.ticket.findMany as jest.Mock).mockResolvedValue(rows);

      const result = await controller.list(undefined, 0, 2);
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });

    it('hasMore is false when take covers exactly all matching rows', async () => {
      const { controller, prisma } = makeController();
      const rows = [
        ticket({ id: 'a' }),
        ticket({ id: 'b' }),
        ticket({ id: 'c' }),
      ];
      (prisma.ticket.findMany as jest.Mock).mockResolvedValue(rows);

      const result = await controller.list(undefined, 0, 3);
      expect(result.items).toHaveLength(3);
      expect(result.hasMore).toBe(false);
    });

    it('resolves screenshotUrl for tickets with a screenshotS3Key, null otherwise, never exposing the raw key', async () => {
      const { controller, prisma, s3 } = makeController();
      const rows = [
        ticket({ id: 'with-shot', screenshotS3Key: 'tickets/with-shot/a.jpg' }),
        ticket({ id: 'no-shot', screenshotS3Key: null }),
      ];
      (prisma.ticket.findMany as jest.Mock).mockResolvedValue(rows);

      const result = await controller.list(undefined, 0, 20);
      const withShot: any = result.items.find((i: any) => i.id === 'with-shot');
      const noShot: any = result.items.find((i: any) => i.id === 'no-shot');

      expect(withShot?.screenshotUrl).toBe('https://s3.example/get?signed=1');
      expect(s3.createDownloadUrl).toHaveBeenCalledWith(
        'tickets/with-shot/a.jpg',
        3600,
      );
      expect(noShot?.screenshotUrl).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('throws NotFoundException when the ticket does not exist', async () => {
      const { controller, prisma } = makeController();
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        controller.updateStatus(admin, 'nope', { status: 'contacted' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sets contactedAt the first time status moves to contacted', async () => {
      const { controller, prisma } = makeController();
      const existing = {
        id: 't-1',
        status: 'unresolved',
        contactedAt: null,
        resolvedAt: null,
      };
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(existing);

      const result = await controller.updateStatus(admin, 't-1', {
        status: 'contacted',
      });

      const updateArg = (prisma.ticket.updateMany as jest.Mock).mock
        .calls[0][0];
      expect(updateArg.data.status).toBe('contacted');
      expect(updateArg.data.contactedAt).toBeInstanceOf(Date);
      expect(result.contactedAt).toBeInstanceOf(Date);
    });

    it('preserves the existing contactedAt when already contacted before, even if status moves away and back', async () => {
      const { controller, prisma } = makeController();
      const firstContact = new Date('2026-01-01T00:00:00Z');
      const existing = {
        id: 't-2',
        status: 'unresolved', // switched away from contacted previously
        contactedAt: firstContact,
        resolvedAt: null,
      };
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(existing);

      await controller.updateStatus(admin, 't-2', { status: 'contacted' });

      const updateArg = (prisma.ticket.updateMany as jest.Mock).mock
        .calls[0][0];
      expect(updateArg.data.contactedAt).toBe(firstContact);
    });

    it('records an audit log entry with correct from/to metadata', async () => {
      const { controller, prisma, auditLog } = makeController();
      const existing = {
        id: 't-3',
        status: 'unresolved',
        contactedAt: null,
        resolvedAt: null,
      };
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(existing);

      await controller.updateStatus(admin, 't-3', { status: 'resolved' });

      expect(auditLog.record).toHaveBeenCalledWith({
        actorUserId: admin.id,
        action: 'ticket.status_updated',
        targetType: 'Ticket',
        targetId: 't-3',
        metadata: { from: 'unresolved', to: 'resolved' },
      });
    });

    // docs/BUSINESS_RULES.md rule 20: resolved is terminal. The guard
    // lives in the atomic updateMany's own `where` (status not already
    // resolved), not a preceding read — see the two race-condition tests
    // below for why that distinction actually matters.
    it('rejects changing the status of an already-resolved ticket, with ConflictException', async () => {
      const { controller, prisma } = makeController();
      const existing = {
        id: 't-4',
        status: 'resolved',
        contactedAt: null,
        resolvedAt: new Date('2026-01-01'),
      };
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        controller.updateStatus(admin, 't-4', { status: 'contacted' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('the updateMany where-clause excludes resolved tickets, guarding atomically rather than via the preceding read', async () => {
      const { controller, prisma } = makeController();
      const existing = {
        id: 't-5',
        status: 'unresolved',
        contactedAt: null,
        resolvedAt: null,
      };
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(existing);

      await controller.updateStatus(admin, 't-5', { status: 'resolved' });

      expect(prisma.ticket.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't-5', status: { not: 'resolved' } },
        }),
      );
    });

    // The actual concurrency guarantee: two "simultaneous" updateStatus
    // calls on the same ticket (one resolving it, one trying to reopen
    // it) can never both succeed, because the terminal guard lives
    // inside the atomic updateMany rather than the preceding read. This
    // simulates the loser of that race directly.
    it('treats a lost race (updateMany affects 0 rows) as already-resolved, never as a silent reopen of an archiving ticket', async () => {
      const { controller, prisma, auditLog, archiveQueue } = makeController();
      const existing = {
        id: 't-6',
        status: 'unresolved',
        contactedAt: null,
        resolvedAt: null,
      };
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        controller.updateStatus(admin, 't-6', { status: 'contacted' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(auditLog.record).not.toHaveBeenCalled();
      expect(archiveQueue.add).not.toHaveBeenCalled();
    });

    it('sets resolvedAt and enqueues an archive job when the transition to resolved succeeds', async () => {
      const { controller, prisma, archiveQueue } = makeController();
      const existing = {
        id: 't-7',
        status: 'unresolved',
        contactedAt: null,
        resolvedAt: null,
      };
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(existing);

      const result = await controller.updateStatus(admin, 't-7', {
        status: 'resolved',
      });

      expect(result.resolvedAt).toBeInstanceOf(Date);
      const updateArg = (prisma.ticket.updateMany as jest.Mock).mock
        .calls[0][0];
      expect(updateArg.data.resolvedAt).toBeInstanceOf(Date);
      expect(archiveQueue.add).toHaveBeenCalledWith(
        'archive-ticket',
        { ticketId: 't-7' },
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('does NOT enqueue an archive job for a transition to unresolved/contacted', async () => {
      const { controller, prisma, archiveQueue } = makeController();
      const existing = {
        id: 't-8',
        status: 'unresolved',
        contactedAt: null,
        resolvedAt: null,
      };
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(existing);

      await controller.updateStatus(admin, 't-8', { status: 'contacted' });

      expect(archiveQueue.add).not.toHaveBeenCalled();
    });

    it('does not enqueue the archive job at all if the atomic update itself is rejected (no partial side effects)', async () => {
      const { controller, prisma, archiveQueue } = makeController();
      const existing = {
        id: 't-9',
        status: 'resolved',
        contactedAt: null,
        resolvedAt: new Date(),
      };
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        controller.updateStatus(admin, 't-9', { status: 'resolved' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(archiveQueue.add).not.toHaveBeenCalled();
    });
  });
});
