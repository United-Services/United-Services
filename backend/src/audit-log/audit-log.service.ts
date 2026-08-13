import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma';

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

  search(params: {
    q?: string;
    actorUserId?: string;
    action?: string;
    skip?: number;
    take?: number;
  }) {
    const { q, actorUserId, action, skip = 0, take = 25 } = params;
    return this.prisma.auditLog.findMany({
      where: {
        ...(actorUserId ? { actorUserId } : {}),
        ...(action ? { action } : {}),
        ...(q
          ? {
              OR: [
                { action: { contains: q, mode: 'insensitive' } },
                { targetType: { contains: q, mode: 'insensitive' } },
                { targetId: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        actor: {
          select: { firstName: true, lastName: true, email: true, role: true },
        },
      },
    });
  }
}
