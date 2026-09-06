// Unit-test-only defaults for the two env vars FailoverService's local
// standby needs. Until recently, prisma.module.ts and
// failover-redis-connection.ts silently fell back to a hardcoded
// (and, for Redis, unauthenticated) localhost target when these were
// unset — which was itself a real security finding (a known-plaintext
// credential / no credential at all), so the fallback was removed in
// favor of failing loudly at boot. That is correct for the running
// app, but several worker specs construct a real
// createFailoverRedisConnection() with `lazyConnect: true` purely to
// inspect the returned Proxy's shape — they never issue a real
// command, so what these point at doesn't matter, only that something
// is set. Only applied if the environment (e.g. the real e2e job in
// ci.yml, which sets its own) hasn't already set one.
process.env.LOCAL_DATABASE_URL ??=
  'postgresql://test:test@localhost:5432/test';
process.env.LOCAL_REDIS_URL ??= 'redis://localhost:6379';
