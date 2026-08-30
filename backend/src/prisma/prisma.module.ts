import { Global, Module } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from './prisma.service';
import { FailoverService } from '../failover/failover.service';
import { PrismaClient } from '../generated/prisma';

// Write operations logged for later replay against primary once it
// recovers — see FailoverReconciliationWorker. Batch ops (createMany
// etc.) are included too; reconciliation replays by re-issuing the
// exact same Prisma args against primary rather than reconstructing
// per-row detail, so one entry per call is enough regardless of how many
// rows it touched.
const WRITE_OPERATIONS = new Set([
  'create',
  'update',
  'upsert',
  'delete',
  'createMany',
  'updateMany',
  'deleteMany',
]);

// Never logs writes to its own bookkeeping tables — logging a write to
// FailoverWriteLog would itself be a write, which would try to log
// itself, forever.
const EXCLUDED_MODELS = new Set(['FailoverWriteLog', 'FailoverConflict']);

function poolSize(): number {
  return process.env.DATABASE_POOL_SIZE
    ? parseInt(process.env.DATABASE_POOL_SIZE, 10)
    : 10;
}

// Every write that reaches this client only does so because
// FailoverService currently reports Postgres as `local` (see this
// file's Proxy below) — so unconditionally logging every write here is
// correct, not an over-broad capture. DbMirrorSyncService, in contrast,
// uses its own entirely separate local connection for the periodic
// primary-to-local replication job, specifically so that background
// housekeeping never gets mistaken for a fallback-mode write.
function withWriteLog(client: PrismaClient): PrismaClient {
  return client.$extends({
    name: 'failover-write-log',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          if (
            EXCLUDED_MODELS.has(model) ||
            !WRITE_OPERATIONS.has(operation)
          ) {
            return result;
          }
          const primaryKey =
            (result as { id?: string } | null)?.id ??
            (args as { where?: { id?: string } })?.where?.id ??
            'n/a';
          // Model name to camelCase client property, e.g. AppointmentSlot
          // becomes appointmentSlot — matches how
          // FailoverReconciliationWorker replays these entries.
          const tableName = model.charAt(0).toLowerCase() + model.slice(1);
          await client.failoverWriteLog
            .create({
              data: {
                tableName,
                operation,
                primaryKey,
                payload: args as object,
              },
            })
            .catch(() => {
              // Never let write-log bookkeeping itself fail the actual
              // request — reconciliation losing one entry is far better
              // than a fallback-mode write failing outright because its
              // own audit trail couldn't be recorded.
            });
          return result;
        },
      },
    },
  }) as unknown as PrismaClient;
}

// Deliberately no `imports: [FailoverModule]` despite injecting
// FailoverService below — FailoverModule is itself @Global (so its
// exports are already visible without an import edge), and
// FailoverModule's own providers (DbMirrorSyncService,
// FailoverReconciliationService) inject PrismaService, exported from
// *this* module — an edge in both directions would be a real circular
// module dependency. See queue.module.ts's identical note.
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: async (failover: FailoverService) => {
        const primary = new PrismaClient({
          adapter: new PrismaPg({
            connectionString: process.env.DATABASE_URL,
            max: poolSize(),
          }),
        });
        const localBase = new PrismaClient({
          adapter: new PrismaPg({
            connectionString:
              process.env.LOCAL_DATABASE_URL ??
              'postgresql://united_services:united_services_local_standby@localhost:5432/united_services',
            max: poolSize(),
          }),
        });
        const local = withWriteLog(localBase);

        await primary.$connect();
        await localBase.$connect();

        // Every existing call site does `this.prisma.user.findMany(...)`
        // etc. directly on the injected PrismaService — for that to keep
        // working unchanged, the DI-provided value itself has to behave
        // like a PrismaClient, not hold one on a nested property.
        return new Proxy(
          {},
          {
            get(_target, prop, _receiver) {
              const active =
                failover.getPostgresMode() === 'local' ? local : primary;
              const value = Reflect.get(active, prop, active);
              return typeof value === 'function' ? value.bind(active) : value;
            },
            // Same reasoning as failover-redis-connection.ts's identical
            // trap — without it `proxy instanceof PrismaClient` is false,
            // which could make a library that branches on that construct
            // its own unconfigured client instead of using this one.
            getPrototypeOf() {
              return PrismaClient.prototype;
            },
          },
        ) as unknown as PrismaService;
      },
      inject: [FailoverService],
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
