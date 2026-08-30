import { PrismaClient } from '../generated/prisma';

// Never instantiated directly — prisma.module.ts's factory provider
// supplies a runtime Proxy for this DI token instead (see that file),
// routing every query to whichever of the primary (Supabase) or local
// (compose `postgres` service) clients FailoverService currently
// reports as active. This class exists purely so every existing
// constructor-injected `prisma: PrismaService` type annotation across
// the codebase keeps type-checking against the real Prisma Client API
// surface, completely unchanged by the failover work.
export abstract class PrismaService extends PrismaClient {}
