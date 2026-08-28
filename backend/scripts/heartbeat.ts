import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';

// `npm run heartbeat` — writes a single INFORMATIONAL row to the audit
// log, meant to be run on a schedule (e.g. `0 */6 * * *` via cron,
// alongside backup-db.ts's identical schedule) rather than only by hand.
// Its only purpose is to make a silently-dead cron (crontab misconfigured
// after a deploy/host migration, script erroring out before it can write)
// visible in the same place admins already look — the Audit Log tab — by
// its absence, instead of only in a log file nobody's watching.
//
// No actorUserId: this has no human actor, and forcing one on would
// misattribute it to whichever admin happened to be picked — see the
// actorUserId comment on the AuditLog model in prisma/schema.prisma.
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const row = await prisma.auditLog.create({
      data: {
        action: 'INFORMATIONAL',
        targetType: 'system',
        targetId: 'scheduler-heartbeat',
        metadata: {
          note: 'Scheduled heartbeat — confirms the cron scheduler is alive.',
        },
      },
    });
    console.log(`Heartbeat recorded: ${row.id} at ${row.createdAt.toISOString()}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Heartbeat failed:', err);
  process.exit(1);
});
