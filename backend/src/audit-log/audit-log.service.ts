import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { fuzzyMatch, searchableText } from '../common/utils/fuzzy-match';
import { SEARCH_SCAN_LIMIT } from '../common/constants/search-scan-limit';
import { DEFAULT_PAGE_SIZE, paginate } from '../common/utils/paginate';
import { Prisma } from '../generated/prisma';

// Every admin action that changes state must call this — see
// docs/BUSINESS_RULES.md rule 8. Kept as a thin wrapper so call sites read
// as intent ("record this action") rather than a raw Prisma write.
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  // actorUserId is optional — reserved for system-generated entries with no
  // human actor (e.g. SchedulerHeartbeatService). Every human-triggered
  // call site must keep passing a real user id; never omit it just because
  // it's convenient.
  record(params: {
    actorUserId?: string;
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
    const {
      q,
      actorUserId,
      action,
      skip = 0,
      take = DEFAULT_PAGE_SIZE,
    } = params;
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
    return paginate(filtered, skip, take);
  }
}
