import Redis from 'ioredis';

// Never instantiated directly — redis.module.ts's factory provider
// supplies a runtime Proxy for this DI token instead (see that file),
// routing every command to whichever of the primary (Upstash) or local
// (compose `redis` service) connections FailoverService currently
// reports as active. This class exists purely so every existing
// constructor-injected `redis: RedisService` type annotation across the
// codebase keeps type-checking against the real ioredis API surface,
// completely unchanged by the failover work.
export abstract class RedisService extends Redis {}
