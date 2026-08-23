import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';

// Prisma 7 requires an explicit driver adapter — there is no more implicit
// env-var connection. Uses the pooled DATABASE_URL (pgbouncer, transaction
// mode); migrations use DIRECT_URL instead, configured in prisma.config.ts.
//
// `max` is explicit rather than left at node-postgres's default (10) so
// it's a deliberate, visible number instead of an accident: this process
// holds at most this many connections against pgbouncer's own pool for
// its entire lifetime (one PrismaService instance per process — see the
// singleton reasoning below), and at N horizontally-scaled instances the
// total client-side demand is N * DATABASE_POOL_SIZE, which has to stay
// under whatever pgbouncer/Supabase is actually configured to hand out.
// Size this down as instance count grows rather than assuming the
// default always fits.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: process.env.DATABASE_POOL_SIZE
    ? parseInt(process.env.DATABASE_POOL_SIZE, 10)
    : 10,
});

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
