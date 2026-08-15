import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { fuzzyMatch, searchableText } from '../common/utils/fuzzy-match';
import { Prisma } from '../generated/prisma';

// Caps how many actor/action-filtered rows are pulled before fuzzy-
// matching and paginating in-app (see search() below) — a generous bound
// for admin-panel scale, not a real pagination limit.
const SEARCH_SCAN_LIMIT = 1000;

// Every admin action that changes state must call this — see
// docs/BUSINESS_RULES.md rule 8. Kept as a thin wrapper so call sites read
// as intent ("record this action") rather than a raw Prisma write.
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  record(params: {
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.auditLog.create({ data: params });
  }

  // q is fuzzy-matched in-app rather than via a SQL `contains` — see
  // fuzzy-match.ts. Since that can't happen inside the DB query, skip/take
  // are applied afterward, in-app, over the fuzzy-filtered results — not
  // pushed down to Prisma the way they were before, which would have
  // paginated the *pre-filter* set instead.
  async search(params: {
    q?: string;
    actorUserId?: string;
    action?: string;
    skip?: number;
    take?: number;
  }) {
    const { q, actorUserId, action, skip = 0, take = 25 } = params;
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(actorUserId ? { actorUserId } : {}),
        ...(action ? { action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: SEARCH_SCAN_LIMIT,
      include: {
        actor: {
          select: { firstName: true, lastName: true, email: true, role: true },
        },
      },
    });
    const filtered = q
      ? rows.filter((r) =>
          fuzzyMatch(searchableText(r.action, r.targetType, r.targetId), q),
        )
      : rows;
    return filtered.slice(skip, skip + take);
  }
}
